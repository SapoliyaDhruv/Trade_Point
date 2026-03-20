require('dotenv').config();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createAdmin = async () => {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Default';
    const adminLastName = process.env.ADMIN_LAST_NAME || 'Admin';

    if (!adminEmail || !adminPassword) {
        console.log('[admin] ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping default admin seed.');
        return;
    }

    const exists = await User.findOne({ email: adminEmail });
    if (!exists) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await User.create({
            firstName: adminFirstName,
            lastName: adminLastName,
            email: adminEmail,
            password: hashedPassword,
            role: 'admin',
            isVerified: true
        });
        console.log('Default admin created');
    }
};

createAdmin();
