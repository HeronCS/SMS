const express = require('express');
const router = express.Router();
const packageJson = require("../../package.json");
const speakeasy = require("speakeasy");
const User = require("../../models/user");
const { Op } = require("sequelize");
const logger = require('../../logger'); 
const path = require('path');

const renderRegistrationForm = (req, res) => {
    
    res.render(path.join('user', 'register'), {
        errorMessages: req.flash('error'),
        successMessage: req.flash('success'),
        session: req.session,
        packageJson,
        message: req.query.message || '',
    });
};

const registerUser = async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ length: 20 });
        const { username, email, password } = req.body;

        // Check if the email or username already exists
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [
                    { username: username },
                    { email: email }
                ]
            }
        });

        if (existingUser) {
            logger.error('Username or email already exists');
            req.flash('error', 'Username or email already exists');
            return res.redirect('/register');
        }

        // Create a new user in the database
        await User.create({ username, email, password });
        logger.danger('New User Created.');
        return res.redirect('/');
    } catch (error) {
        logger.error('Error registering user: ' + error.message);
        req.flash('error', 'Error registering user: ' + error.message);
        return res.redirect('/register');
    }
};

router.get('/register', renderRegistrationForm);
router.post('/register', registerUser);

module.exports = router;
