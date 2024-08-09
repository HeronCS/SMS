// controllers/quoteCRUD.js
const express = require('express');
const router = express.Router();
const packageJson = require('../../package.json');
const Quotes = require('../../models/quote');
const Clients = require('../../models/client');
const helpers = require('../../helpers');
const moment = require('moment');
const logger = require('../../logger');
const path = require('path');

const createQuote = async (req, res) => {
    try {
        const { date, quote_ref, job_ref, location, contact_ref, value, desc, invoice_no, invoice_date} = req.body;
        logger.info(req.body);
        const clientId = req.params.client;
        const newQuote = await Quotes.create({
            date: date,
            quote_ref: quote_ref,
            job_ref: job_ref,
            location: location,
            clientId: clientId,
            contact_ref: contact_ref,
            value: value,
            desc: desc,
            invoice_no: invoice_no,
            invoice_date: invoice_date
        });

        res.redirect(`/quote/read/${newQuote.id}`);
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            const errorMessages = error.errors.map((err) => err.message);
            logger.error(`Validation errors: ${errorMessages.join(', ')}`);
        }
        logger.error('Error creating quote:'+ error.message);
        req.flash('error', 'Error creating quote: ' + error.message);
        res.redirect('/dashboard/quote');
    }
};

const readQuote = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Access denied.');
            return res.redirect('/');
        }

        const quote = await Quotes.findByPk(req.params.quote, {
            include: [{
                model: Clients
            }]
          });

        if (!req.params.quote) {
            return res.status(404).json({ error: 'Quote not found' });
        } else {
            res.render(path.join('quotes', 'viewQuote'), {
                quote,
                errorMessages: req.flash('error'),
                successMessage: req.flash('success'),
                session: req.session,
                packageJson,
                moment: moment,
                slimDateTime: helpers.slimDateTime,
            });
        }
    } catch (error) {
        logger.error('Error viewing quote:'+ error.message);
        req.flash('error', 'Error viewing quote: ' + error.message);
        res.redirect('/dashboard/quote');
    }
};

const readQuotes = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Access denied.');
            return res.redirect('/');
        }
        
        const quotes = await Quotes.findAll({
            where: { ClientId: req.params.client },
            order: [['date', 'DESC']],
        });

        res.render(path.join('quotes', 'viewQuotes'), {
            quotes,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            moment: moment,
            slimDateTime: helpers.slimDateTime,
        });
    } catch (error) {
        logger.error('Error viewing quotes:'+ error.message);
        req.flash('error', 'Error viewing quotes: ' + error.message);
        res.redirect('/dashboard/quote');
    }
};

const updateQuote = async (req, res) => {
    try {

        const quote = await Quotes.findByPk(req.params.id);
        if (!quote) {
            throw new Error('Quote not found');
        }

        await Quotes.update(req.body, { where: { id: req.params.id } });

        req.flash('success', 'Quote updated successfully');
        return res.redirect(`/quote/read/${req.params.id}`);
    } catch (error) {
        logger.error(`Error updating quote with ID: ${req.params.id}. Details:` + error.message);
        req.flash('error', `Error updating quote with ID: ${req.params.id}. Details:` + error.message);
        return res.redirect(`/quote/read/${req.params.id}`);
    }
};

const deleteQuote = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.status(403).send('Access denied. Only admins can delete quotes.');
        }

        const quote = await Quotes.findByPk(req.params.id);

        if (!quote) {
            req.flash('error', 'Quote not found');
            return res.redirect('/dashboard/quote');
        }

        await quote.destroy();

        req.flash('success', 'Quote deleted successfully');
        res.redirect('/dashboard/quote');
    } catch (error) {
        logger.error('Error deleting quote: ' + error.message);
        req.flash('error', 'Error deleting quote: ' + error.message);
        res.redirect('/dashboard/quote');
    }
};

router.post('/quote/create/:client', createQuote);
router.get('/quote/read/:quote', readQuote);
router.get('/quote/read/:client', readQuotes);
router.post('/quote/update/:id', updateQuote);
router.post('/quote/delete/:id', deleteQuote);

module.exports = router;