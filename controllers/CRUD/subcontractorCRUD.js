const express = require('express');
const router = express.Router();
const packageJson = require('../../package.json');
const Subcontractor = require('../../models/subcontractor');
const helpers = require('../../helpers');
const { Op } = require('sequelize');
const logger = require('../../logger'); 
const path = require('path');

const createSubcontractor = async (req, res) => {
    try {
        // Check if the user has permissions
        if (!req.session.user.permissionCreateSubcontractor) {
            return res.status(403).send('Access denied.');
        }

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
            vatNumber,
            deduction,
            isGross
        } = req.body;

        // Check if the subcontractor already exists
        const existingSubcontractor = await Subcontractor.findOne({
            where: {
                [Op.or]: [{ utrNumber }],
            },
        });

        if (existingSubcontractor) {
            req.flash('error', 'User with the same UTR already exists.');
            return res.redirect('/subcontractor/create'); // Redirect to the appropriate page
        }

        const requiredFields = [company, utrNumber];
        if (requiredFields.some(field => !field)) {
            req.flash('error', 'Incomplete required form data.');
            return res.redirect('/subcontractor/create');
        }

        // Null checks for specific fields
        const nullCheckFields = ['company', 'utrNumber'];
        const sanitizedData = Object.fromEntries(
            Object.entries(req.body).map(([key, value]) => [
                key,
                nullCheckFields.includes(key) ? value || null : value,
            ])
        );

        await Subcontractor.create(sanitizedData);

        req.flash('success', 'Subcontractor created.');
        const referer = '/dashboard';
        res.redirect(referer);
    } catch (error) {
        logger.error('Error creating subcontractor:  ', error.message);
        req.flash('error', 'Error creating subcontractor: ' + error.message);
        return res.redirect('/');
    }
};

const readSubcontractor = async (req, res) => {
    try {
        // Check if the user has permissions
        if (!req.session.user.permissionReadSubcontractor) {
            return res.status(403).send('Access denied.');
        }

        const subcontractor = await Subcontractor.findByPk(req.params.id);

        if (!subcontractor) {
            return res.status(404).send('Subcontractor not found');
        }

        res.render(path.join('subcontractors', 'viewSubcontractor'), {
            subcontractor,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
            formatCurrency: helpers.formatCurrency,
        });
    } catch (error) {
        logger.error('Error reading subcontractor:  ', error.message);
        req.flash('error', 'Error reading subcontractor: ' + error.message);
        return res.redirect('/');
    }
};

const updateSubcontractor = async (req, res) => {
    try {
        // Check if the user has permissions
        if (!req.session.user.permissionUpdateSubcontractor) {
            return res.status(403).send('Access denied.');
        }

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
            vatNumber,
            deduction,
            isGross,
            isReverseCharge,
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
            subcontractor.vatNumber = vatNumber;

            subcontractor.deduction = deduction;
            subcontractor.isGross = isGross;
            subcontractor.isReverseCharge = isReverseCharge;

            await subcontractor.save();

            req.flash('success', 'Subcontractor updated.');
            logger.info('Subcontractor updated.');
            const referrer = '/dashboard';
            res.redirect(referrer);
        } else {
            req.flash('error', 'Subcontractor not found.');
            logger.warn('Subcontractor not found.');
            const referer = req.get('referer');
            res.redirect(referer);
        }
    } catch (error) {
        logger.error('Error updating subcontractor:  ', error.message);
        req.flash('error', 'Error updating subcontractor: ' + error.message);
        res.redirect('/dashboard/subcontractor');
    }
};

const deleteSubcontractor = async (req, res) => {
    try {
        // Check if the user has permissions
        if (!req.session.user.permissionDeleteSubcontractor) {
            return res.status(403).send('Access denied.');
        }

        const subcontractor = await Subcontractor.findByPk(req.params.id);

        if (!subcontractor) {
            req.flash('error', 'Subcontractor not found');
            logger.warn('Subcontractor not found.');
            const referer = req.get('referer');
            return res.redirect(referer);
        }

        await subcontractor.destroy();

        req.flash('success', 'Subcontractor deleted.');
        logger.info('Subcontractor deleted.');
        res.redirect('/dashboard/subcontractor');
    } catch (error) {
        logger.error('Error deleting subcontractor:  ', error.message);
        req.flash('error', 'Error deleting subcontractor: ' + error.message);
        res.redirect('/dashboard/subcontractor');
    }
};

router.post('/subcontractor/create/', createSubcontractor);
router.get('/subcontractor/read/:id', readSubcontractor);
router.post('/subcontractor/update/:id', updateSubcontractor);
router.post('/subcontractor/delete/:id', deleteSubcontractor);

module.exports = router;
