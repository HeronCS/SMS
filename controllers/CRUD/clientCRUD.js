const express = require('express');
const router = express.Router();
const packageJson = require('../../package.json');
const helpers = require('../../helpers');
const moment = require('moment');
const logger = require('../../logger');
const path = require('path');
const Clients = require('../../models/client');
const Contacts = require('../../models/contact');
const Quotes = require('../../models/quote');

const createClient = async (req, res) => {
    try {
        const {
            name 
        } = req.body;
        const clients = await Clients.create({
            name: name
        });
        req.flash('success', 'Client created successfully');
        return res.redirect(`/client/read/${clients.id}`);
    } catch (error) {
        logger.error('Error creating client:' + error.message);
        req.flash('error', 'Error: ' + error.message);
        return res.redirect('/');
    }
};

const readClient = async (req, res) => {
    try {
        // Check if session exists and session user role is an admin
        if (!req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Access denied.');
            return res.redirect('/'); // Ensure to return here
        }

        const clients = await Clients.findByPk(req.params.client, {
            include: [
                { model: Contacts },
                { model: Quotes }
            ]
        });

        if (!clients) {
            req.flash('error', 'Client not found');
            return res.redirect('/');
        }

        return res.render(path.join('client', 'viewClient'), {
            clients,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
        });
    } catch (error) {
        logger.error('Error reading client:' + error.message);
        req.flash('error', 'Error: ' + error.message);
        return res.redirect('/');
    }
};

const updateClient = async (req, res) => {
    try {
        const clients = await Clients.findByPk(req.params.client);

        if (!clients) {
            return res.status(404).send('Client not found');
        }

        await clients.update(req.body);
        req.flash('success', 'Client updated successfully');
        return res.redirect(`/client/read/${clients.client}`);
    } catch (error) {
        logger.error('Error updating client:' + error.message);
        req.flash('error', 'Error: ' + error.message);
        return res.redirect('/');
    }
};

const deleteClient = async (req, res) => {
    try {
        const clients = await Clients.findByPk(req.params.client);

        if (!clients) {
            return res.status(404).send('Client not found');
        }

        await clients.destroy();
        req.flash('success', 'Client deleted successfully');
        res.redirect('/dashboard/client');
    } catch (error) {
        logger.error('Error deleting client:' + error.message);
        req.flash('error', 'Error: ' + error.message);
        return res.redirect(req.get('referer') || '/');
    }
};

router.post('/client/create/', createClient);
router.get('/client/read/:client', readClient);
router.post('/client/update/:client', updateClient);
router.post('/client/delete/:client', deleteClient);

module.exports = router;