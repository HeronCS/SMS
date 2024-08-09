const express = require('express');
const router = express.Router();

const packageJson = require('../../package.json');
const User = require('../../models/user');
const helpers = require('../../helpers');
const logger = require('../../logger');
const path = require('path');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const Joi = require('joi');

const schema = Joi.object({
    username: Joi.string().min(1).required(),
    email: Joi.string().email().required(),
    role: Joi.string().valid('subcontractor', 'employee', 'accountant', 'hmrc', 'admin').required(),
    permissionCreateUser: Joi.boolean(),
    permissionReadUser: Joi.boolean(),
    permissionUpdateUser: Joi.boolean(),
    permissionDeleteUser: Joi.boolean(),
    permissionCreateSubcontractor: Joi.boolean(),
    permissionReadSubcontractor: Joi.boolean(),
    permissionUpdateSubcontractor: Joi.boolean(),
    permissionDeleteSubcontractor: Joi.boolean(),
    permissionCreateInvoice: Joi.boolean(),
    permissionReadInvoice: Joi.boolean(),
    permissionUpdateInvoice: Joi.boolean(),
    permissionDeleteInvoice: Joi.boolean(),
});

const createUser = async (req, res) => {
    try {
        const { error, value } = schema.validate(req.body);
        if (error) {
            req.flash('error', 'Invalid input.' + error);
            return res.redirect('/');
        }

        const { username, email, password, role } = value;

        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ username }, { email }],
            },
        });

        if (existingUser) {
            req.flash('error', 'Registration failed.');
            return res.redirect('/');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            username,
            email,
            password: hashedPassword,
            role,
        });

        req.flash('success', 'User created successfully.');
        res.redirect('/');
    } catch (error) {
        logger.error('Error creating user: ' + error.message);
        req.flash('error', 'An error occurred.');
        res.redirect('/error');
    }
};

const readUser = async (req, res) => {
    try {
        // Validate the session user state
        if (!req.session || !req.session.user) {
            return res.status(403).send('Invalid session or user.');
        }

        // Check if the logged-in user has permissions.
        if (!req.session.user.permissionReadUser) {
            return res.status(403).send('Access denied.');
        }

        // Verify if req.params and req.params.id exist
        if (!req.params || !req.params.id) {
            return res.status(400).send('Bad Request: Missing user id parameter.');
        }

        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).send('User not found');
        }

        res.render(path.join('users', 'viewUser'), {
            user,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
            formatCurrency: helpers.formatCurrency,
        });
    } catch (error) {
        logger.error('Error reading user:  ', error.message);
        res.status(500).send('An error occurred.');
    }
};

const updateUser = async (req, res) => {
    try {
        // Validate the session user state
        if (!req.session || !req.session.user) {
            return res.status(403).send('Invalid session or user.');
        }

        // Check if the logged-in user has permissions.
        if (!req.session.user.permissionUpdateUser) {
            return res.status(403).send('Access denied.');
        }

        // Check if User exists and has an update method
        if (!User || typeof User.update !== 'function') {
            logger.error('Error: User model or update method not found!');
            return res.status(500).send('Server Error.');
        }

        // Verify if req.params and req.params.id exist
        if (!req.params || !req.params.id) {
            return res.status(400).send('Bad Request: Missing user id parameter.');
        }

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).send(error.details[0].message);
        }

        const {
            username,
            email,
            role,
            permissionCreateUser,
            permissionReadUser,
            permissionUpdateUser,
            permissionDeleteUser,
            permissionCreateSubcontractor,
            permissionReadSubcontractor,
            permissionUpdateSubcontractor,
            permissionDeleteSubcontractor,
            permissionCreateInvoice,
            permissionReadInvoice,
            permissionUpdateInvoice,
            permissionDeleteInvoice
        } = req.body;

        // Then update the user data.
        const updatedUser = await User.update({
            username,
            email,
            role,
            permissionCreateUser,
            permissionReadUser,
            permissionUpdateUser,
            permissionDeleteUser,
            permissionCreateSubcontractor,
            permissionReadSubcontractor,
            permissionUpdateSubcontractor,
            permissionDeleteSubcontractor,
            permissionCreateInvoice,
            permissionReadInvoice,
            permissionUpdateInvoice,
            permissionDeleteInvoice
        }, {
            where: { id: req.params.id },
            returning: true, // To get the updated user data
        });

        if (updatedUser[0] !== 0) {
            req.flash('success', 'User updated.');

            // Check if the updated user is the same as the logged-in user
            if (req.session.user.id === req.params.id) {
                // Check for the existence of updatedUser[1][0].dataValues
                if (updatedUser[1] && updatedUser[1][0] && updatedUser[1][0].dataValues) {
                    // Then update the session user properties
                    req.session.user = {
                        ...req.session.user,
                        ...updatedUser[1][0].dataValues
                    };
                }
            }
        } else {
            req.flash('error', 'User not found.');
            res.redirect('/dashboard/user');
        }
        res.redirect('/user/read/' + req.params.id);
    } catch (error) {
        logger.error('Error updating user:  ', error.message);
        req.flash('error', 'Error updating user: ' + error.message);
        res.redirect('/error');
    }
};

const deleteUser = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin' && !req.session.user.permissionDeleteUser) {
            return res.status(403).send('Access denied. Only admins can delete users.');
        }

        if (req.session.user.id === req.params.id) {
            return res.status(403).send('Access denied. You cannot delete your own account.');
        }

        const user = await User.findByPk(req.params.id);
        if (!user) {
            req.flash('error', 'User not found');
            res.redirect('/dashboard/user');
        } else {
            await user.destroy();
            req.flash('success', 'User deleted successfully');
            res.redirect('/dashboard/user');
        }
    } catch (error) {
        logger.error('Error deleting user:  ', error.message);
        req.flash('error', 'Error deleting user: ' + error.message);
        res.redirect('/error');
    }
};

router.post('/user/create/:selected', helpers.ensurePermission(['permissionCreateUser']), createUser);
router.get('/user/read/:id', helpers.ensurePermission(['permissionReadUser']), readUser);
router.post('/user/update/:id', helpers.ensurePermission(['permissionUpdateUser']), updateUser);
router.post('/user/delete/:id', helpers.ensurePermission(['permissionDeleteUser']), deleteUser);

module.exports = router;
