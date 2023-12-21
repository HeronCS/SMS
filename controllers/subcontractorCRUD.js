// /controllers/subcontractorCRUD.js

const express = require('express');
const router = express.Router();

const packageJson = require('../package.json');
const Subcontractor = require('../models/subcontractor');
const helpers = require('../helpers');
const {
    Op
} = require('sequelize');

const createSubcontractor = async (req, res) => {
    try {

        const {
            name,
            company,
            line1,
            line2,
            city,
            county,
            postalCode,
            cisNumber,
            utrNumber,
            isGross
        } = req.body;

        if (req.session.user.role !== 'admin') {
            return res.status(403).send('Access denied.');
        }

        // Check if the subcontractor already exists by username or email
        const existingSubcontractor = await Subcontractor.findOne({
            where: {
                [Op.or]: [{
                    name
                }, {
                    company
                }, {
                    utrNumber
                }, {
                    cisNumber
                }],
            },
        });

        if (existingSubcontractor) {
            req.flash('error', 'User with the same username or email already exists.');
            return res.redirect('/admin'); // Redirect to the appropriate page
        }

        if (!name || !company || !line1 || !city || !county || !postalCode || !cisNumber || !utrNumber) {
            return res.status(400).send('Incomplete form data');
        }


        await Subcontractor.create({
            name,
            company,
            line1,
            line2,
            city,
            county,
            postalCode,
            cisNumber,
            utrNumber,
            isGross
        });

        req.flash('success', 'Subcontractor created.');
        const referrer = '/admin';
        res.redirect(referrer);
    } catch (error) {
        req.flash('error', 'Error creating subcontractor: ' + error.message);
        const referrer = req.get('referer') || '/';
        res.redirect(referrer);
    }
};
const readSubcontractor = async (req, res) => {
    try {
        // Check if the user is an admin
        if (req.session.user.role !== 'admin') {
            return res.status(403).send('Access denied.');
        }

        const subcontractor = await Subcontractor.findByPk(req.params.id);

        if (!subcontractor) {
            return res.status(404).send('Subcontractor not found');
        }

        res.render('viewSubcontractor', {
            subcontractor,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
            formatCurrency: helpers.formatCurrency,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
};
const updateSubcontractor = async (req, res) => {
    try {
        const {
            name,
            company,
            line1,
            line2,
            city,
            county,
            postalCode,
            cisNumber,
            utrNumber,
            isGross,
            vatnumber,
            deduction,
        } = req.body;

        const subcontractor = await Subcontractor.findByPk(req.params.id);

        if (subcontractor) {

            subcontractor.name = name;
            subcontractor.company = company;
            subcontractor.line1 = line1;
            subcontractor.line2 = line2;
            subcontractor.city = city;
            subcontractor.county = county;
            subcontractor.postalCode = postalCode;
            subcontractor.cisNumber = cisNumber;
            subcontractor.utrNumber = utrNumber;
            subcontractor.isGross = isGross;
            subcontractor.vatnumber = vatnumber;
            subcontractor.deduction = deduction;

            await subcontractor.save();

            req.flash('success', 'Subcontractor updated.');
            console.log('Subcontractor updated.');
            const referrer = '/admin';
            res.redirect(referrer);
        } else {
            req.flash('error', 'Subcontractor not found.');
            console.log('Subcontractor not found.');
            const referrer = '/admin';
            res.redirect(referrer);
        }
    } catch (error) {
        // Handle error
        console.error('Error updating subcontractor:', error);
        req.flash('error', 'Error updating subcontractor: ' + error.message);
        const referrer = '/admin';
        res.redirect(referrer);
    }
};
const deleteSubcontractor = async (req, res) => {
    try {
        // Check if the user is an admin
        if (req.session.user.role !== 'admin') {
            return res.status(403).send('Access denied. Only admins can delete subcontractors.');
        }

        const subcontractor = await Subcontractor.findByPk(req.params.id);

        if (!subcontractor) {
            // res.status(404).send('Subcontractor not found');
            return req.flash('error', 'Subcontractor not found');
        }

        await subcontractor.destroy();

        req.flash('success', 'Subcontractor deleted.');
        console.log('Subcontractor deleted.');
        const referrer = req.get('referer') || '/admin';
        res.redirect(referrer);
    } catch (error) {
        req.flash('error', 'Error: ' + error.message);
        const referrer = req.get('referer') || '/admin';
        res.redirect(referrer);
    }
};

router.post('/subcontractor/create/', createSubcontractor);
router.get('/subcontractor/read/:id', readSubcontractor);
router.post('/subcontractor/update/:id', updateSubcontractor);
router.get('/subcontractor/delete/:id', deleteSubcontractor);

module.exports = router;