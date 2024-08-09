const express = require('express');
const router = express.Router();
const packageJson = require('../../package.json');
const helpers = require('../../helpers');
const moment = require('moment');
const logger = require('../../logger'); 
const path = require('path');
const Invoice = require('../../models/invoice');
const Subcontractor = require('../../models/subcontractor');

const createInvoice = async (req, res) => {
    try {
        const validatedData = helpers.validateInvoiceData(req.body);
        const subcontractor = await Subcontractor.findByPk(req.params.selected);
        const amounts = helpers.calculateInvoiceAmounts(validatedData.labourCost, validatedData.materialCost, subcontractor.deduction, subcontractor.cisNumber, subcontractor.vatNumber);

        // If remittanceDate or submissionDate are not provided, set them to null
        validatedData.remittanceDate = validatedData.remittanceDate || null;
        validatedData.submissionDate = validatedData.submissionDate || null;

        // Calculate Tax Year and Tax Month
        const calculateTaxYearAndMonth = (date) => {
            if (!date) return { taxYear: null, taxMonth: null };

            const remittanceMoment = moment.utc(date);
            const year = remittanceMoment.year();
            const startOfTaxYear = moment.utc(`${year}-04-06T00:00:00Z`);

            // Determine tax year
            const taxYear = remittanceMoment.isBefore(startOfTaxYear) ? `${year - 1}/${year}` : `${year}/${year + 1}`;

            // Determine tax month
            const startOfCurrentTaxYear = remittanceMoment.isBefore(startOfTaxYear) ? moment.utc(`${year - 1}-04-06T00:00:00Z`) : startOfTaxYear;
            const taxMonth = remittanceMoment.diff(startOfCurrentTaxYear, 'months') + 1;

            return { taxYear, taxMonth };
        };

        const { taxYear, taxMonth } = calculateTaxYearAndMonth(validatedData.remittanceDate);

        // Create invoice record
        const newInvoice = await Invoice.create({
            invoiceNumber: validatedData.invoiceNumber,
            kashflowNumber: validatedData.kashflowNumber,
            invoiceDate: validatedData.invoiceDate,
            remittanceDate: validatedData.remittanceDate,
            grossAmount: amounts.grossAmount,
            labourCost: validatedData.labourCost,
            materialCost: validatedData.materialCost,
            cisAmount: amounts.cisAmount,
            netAmount: amounts.netAmount,
            submissionDate: validatedData.submissionDate,
            reverseCharge: amounts.reverseCharge,
            month: taxMonth,
            year: taxYear,
            SubcontractorId: req.params.selected
        });

        res.redirect(`/invoice/read/${newInvoice.id}`);

    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            const errorMessages = error.errors.map((err) => err.message);
            logger.error(`Validation errors: ${errorMessages.join(', ')}`);
            return res.render('createInvoice', {
                errorMessages: req.flash('error'),
                successMessage: req.flash('success'),
                session: req.session,
                packageJson,
            });
        }
        logger.error('Error creating invoice:' + error.message);
        req.flash('error', 'Error: ' + error.message);
        res.redirect('/error');
    }
};

const readInvoice = async (req, res) => {
    try {
        // Check if session exists and session user role is an admin
        if (!req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Access denied.');
            return res.redirect('/'); // Ensure to return here
        }

        const invoice = await Invoice.findByPk(req.params.invoice, {
            include: [
                { model: Subcontractor }
            ],
            order: [['invoiceNumber', 'ASC']]
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        res.render(path.join('invoices', 'viewInvoice'), {
            invoice,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
            formatCurrency: helpers.formatCurrency,
        });
    } catch (error) {
        logger.error('Error viewing invoice:'+ error.message);
        req.flash('error', 'Error viewing invoice:' + error.message);
        res.redirect('/error');
    }
};

const readInvoices = async (req, res) => {
    try {
        // Check if session exists and session user role is an admin
        if (!req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Access denied.');
            return res.redirect('/'); // Ensure to return here
        }

        const subcontractor = await Subcontractor.findByPk(req.params.subcontractor);

        const invoices = await Invoice.findAll({
            include: [
                {
                    model: Subcontractor,
                    where: { id: req.params.subcontractor }
                }
            ],
            order: [['invoiceNumber', 'DESC']]
        });

        if (!invoices) {
            return res.status(404).json({ error: 'Invoices not found' });
        }

        res.render(path.join('invoices', 'viewInvoices'), {
            subcontractor,
            invoices,
            errorMessages: req.flash('error'),
            successMessage: req.flash('success'),
            session: req.session,
            packageJson,
            slimDateTime: helpers.slimDateTime,
            formatCurrency: helpers.formatCurrency,
        });
    } catch (error) {
        logger.error('Error viewing invoices:'+ error.message);
        req.flash('error', 'Error viewing invoices:' + error.message);
        res.redirect('/error');
    }
};

const updateInvoice = async (req, res) => {
    try {
        helpers.validateInvoiceData(req.body);

        const invoice = await Invoice.findByPk(req.params.invoice);
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        if (!invoice.SubcontractorId) {
            throw new Error(`No subcontractorId associated with invoice number: ${req.params.invoice}`);
        }

        const subcontractor = await Subcontractor.findByPk(invoice.SubcontractorId);
        if (!subcontractor) {
            throw new Error(`Subcontractor with ID: ${invoice.SubcontractorId} not found for invoice ${req.params.invoice}`);
        }

        const amounts = helpers.calculateInvoiceAmounts(req.body.labourCost, req.body.materialCost, subcontractor.deduction, subcontractor.cisNumber, subcontractor.vatNumber);

        await Invoice.update({ ...req.body, ...amounts }, { where: { id: req.params.invoice } });

        req.flash('success', 'Invoice updated successfully');
        return res.redirect(`/invoice/read/${req.params.invoice}`);
    } catch (error) {
        logger.error(`Error updating invoice with ID: ${req.params.invoice}. Details:` + error.message);
        req.flash('error', `Error updating invoice with ID: ${req.params.invoice}. Details:` + error.message);
        return res.redirect(`/invoice/read/${req.params.invoice}`);
    }
};

const deleteInvoice = async (req, res) => {
    try {
        // Check if the user is an admin
        if (req.session.user.role !== 'admin') {
            return res.status(403).send('Access denied. Only admins can delete invoices.');
        }
        // TODO: Add SubcontractorId to the invoice model and refer back to the /invoices/read/:id route
        const invoice = await Invoice.findByPk(req.params.invoice);

        if (!invoice) {
            req.flash('error', 'Invoice not found');
            return res.redirect(req.get('referer') || '/dashboard/stats');
        }

        await invoice.destroy();

        req.flash('success', 'Invoice deleted successfully');
        res.redirect('/dashboard/invoice');
    } catch (error) {
        logger.error('Error deleting invoice: ' + error.message);
        req.flash('error', 'Error deleting invoice: ' + error.message);
        res.redirect('/error');
    }
};

router.post('/invoice/create/:selected', createInvoice);
router.get('/invoice/read/:invoice', readInvoice);
router.get('/invoices/read/:subcontractor', readInvoices);
router.post('/invoice/update/:invoice', updateInvoice);
router.post('/invoice/delete/:invoice', deleteInvoice);

module.exports = router;
