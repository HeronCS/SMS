// controllers/subcontractor.js

const packageJson = require('../package.json');
const Subcontractor = require('../models/subcontractor');

// Render the subcontractor creation form
const renderSubcontractorForm = (req, res) => {
    res.render('createSubcontractor', {
        errorMessages: req.flash('error'),
        successMessage: req.flash('success'),
        session: req.session,
        packageJson
    });
};

// Handle the submission of the subcontractor creation form
async function submitSubcontractorForm(req, res) {
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

        res.send('Subcontractor created successfully');
    } catch (error) {
        res.status(500).send('Error creating subcontractor: ' + error.message);
    }
}

module.exports = {
    renderSubcontractorForm,
    submitSubcontractorForm
};