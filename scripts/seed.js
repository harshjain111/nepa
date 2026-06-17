'use strict';

/* ============================================================
   seed.js — insert ~8 realistic sample registrations so the
   admin dashboard looks populated for a demo.
   Run: npm run seed     Wipe: set data/registrations.json to []
   (or run the admin delete actions).
   Note: sample records have screenshotUrl = null so no image
   files are needed; UPI/Bank samples simply have no preview.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');

const samples = [
  { fullName: 'Rajesh Agarwal', mobile: '9435012345', email: 'rajesh@agarwaloils.in', organization: 'Agarwal Mustard Mills', nepaMember: true, paymentMethod: 'UPI', referenceNo: null, note: null, status: 'Confirmed' },
  { fullName: 'Priya Sharma', mobile: '9864023456', email: 'priya.sharma@northeastfoods.com', organization: 'North East Foods Pvt Ltd', nepaMember: false, paymentMethod: 'Bank', referenceNo: 'NEFT2026081501', note: null, status: 'Confirmed' },
  { fullName: 'Dr. Anil Bhattacharya', mobile: '9954034567', email: 'anil.b@gmc.ac.in', organization: 'Guwahati Medical College', nepaMember: true, paymentMethod: 'Cash', referenceNo: null, note: 'Will arrive Day Two morning.', status: 'Pending' },
  { fullName: 'Mahesh Kabra', mobile: '9435045678', email: 'mahesh@kabratraders.in', organization: 'Kabra Edible Oil Traders', nepaMember: true, paymentMethod: 'Bank', referenceNo: 'IMPS889902', note: null, status: 'Confirmed' },
  { fullName: 'Sunita Devi', mobile: '9707056789', email: 'sunita.fpo@gmail.com', organization: 'Brahmaputra Farmer Producer Org', nepaMember: false, paymentMethod: 'Cash', referenceNo: null, note: null, status: 'Pending' },
  { fullName: 'Vikram Nagpal', mobile: '9821067890', email: 'vikram@nagpaloils.com', organization: 'Nagpal Refineries', nepaMember: true, paymentMethod: 'UPI', referenceNo: null, note: null, status: 'Pending' },
  { fullName: 'Farhan Ahmed', mobile: '9864078901', email: 'farhan@horecasupplies.in', organization: 'HoReCa Supplies Assam', nepaMember: false, paymentMethod: 'UPI', referenceNo: null, note: null, status: 'Confirmed' },
  { fullName: 'Lakshmi Narayan', mobile: '9435089012', email: 'ln@kachi-ghani.co.in', organization: 'Kachi Ghani Collective', nepaMember: true, paymentMethod: 'Bank', referenceNo: 'NEFT2026080203', note: null, status: 'Confirmed' },
];

const DELEGATE_FEE_EARLY = 8000;
const MEMBERSHIP_FEE = 3100;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Spread createdAt across the past two weeks (deterministic offsets).
const base = Date.now();
const records = samples.map((s, i) => {
  const membershipFee = s.nepaMember ? MEMBERSHIP_FEE : 0;
  const delegateFee = DELEGATE_FEE_EARLY; // all early bird for the demo
  return {
    id: crypto.randomUUID(),
    regId: `NEPA26-${1001 + i}`,
    createdAt: new Date(base - (samples.length - i) * 36 * 60 * 60 * 1000).toISOString(),
    fullName: s.fullName,
    mobile: s.mobile,
    email: s.email,
    organization: s.organization,
    nepaMember: s.nepaMember,
    feeType: 'Early Bird',
    delegateFee,
    membershipFee,
    totalAmount: delegateFee + membershipFee,
    paymentMethod: s.paymentMethod,
    referenceNo: s.referenceNo,
    screenshotUrl: null,
    note: s.note,
    status: s.status,
  };
});

fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
console.log(`Seeded ${records.length} sample registrations into data/registrations.json`);
console.log('To wipe: set data/registrations.json back to []  (or delete rows in the admin).');
