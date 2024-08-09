const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const helpers = require('../../helpers');
const packageJson = require('../../package.json');
const logger = require('../../logger'); 
const path = require('path');

// Update the account settings
const updateAccountSettings = async (req, res) => {
    try {
        // Fetch the user data based on the current user's session
        const user = await User.findOne({
            where: {
                id: req.session.user.id
            }
        });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Update the user's settings based on the form data
        user.username = req.body.newUsername;
        user.email = req.body.newEmail;
        // Update any other fields as needed

        await user.save();

        logger.info('Account settings updated successfully');
        req.flash('success', 'Account settings updated successfully');
        res.redirect('/account');
    } catch (error) {
        logger.error('Error updating account settings:  ', error.message);
        req.flash('error', 'Failed to update account settings');
        res.redirect('/account');
    }
};

// Display the account page
const getAccountPage = async (req, res) => {
    try {
        
        // Fetch the user data based on the current user's session
        const user = await User.findOne({
            where: {
                id: req.session.user.id
            }
        });

        res.render(path.join('user', 'account'), {
            user: user,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
            message: req.query.message || '',
        });
    } catch (error) {
        logger.error('Error getting account page:  ', error.message);
        req.flash('error', 'Error getting account page: ' + error.message);
        return res.redirect('/');
    }
};

router.get('/account', getAccountPage);
router.post('/account/settings', updateAccountSettings);

module.exports = router;
