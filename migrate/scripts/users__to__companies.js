'use strict';

const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../../models/user.model');
const { Rule } = require('../../models/rule.model');
const { Credential } = require('../../models/credential.model');
const Certificate = require('../../models/certificate.model');
const RuleHistory = require('../../models/rule-history.model');
const databaseConfig = require('../../config/database');
const { pathFromComponents } = require('../../modules/path-utilities');

mongoose.connect(databaseConfig.databaseURL).then(async () => {
  await migrateRules({ dryRun: process.argv.includes('--dryRun') });
  mongoose.connection.close();
});

async function migrateRules({ dryRun=true }) {

  const migrationCredentials = {
    "OBJECTID": "COMPANY",
  }

  // Commented certificates were not migrated.
  // Do we want to migrate them in the future?
  const migrationCertificates = {
    "OBJECTID": "COMPANY",
  }

  function emailForCompanyIdentifier(companyIdentifier) {
    return `datadragon.${companyIdentifier}@AGENCYHOSTNAME`;
  }

  async function updateRulesByAccountPath({oldPath, newPath, newUser, newAccountName}) {
    const rules = await Rule.find({ account: oldPath });
    console.log('  - updating', rules.length, 'rules');
    console.log('    - old account:', oldPath);
    console.log('    - new account:', newPath);
    for (const rule of rules) {
      // Update Rule
      rule.account = newPath;
      rule.user = newUser;
      rule.metadata.accountName = newAccountName;
      if (dryRun === false) {
        await rule.save();
      }
      // Update RuleHistory
      if (dryRun === false) {
        const result = await RuleHistory.updateMany({ ruleID: rule._id }, { userID: newUser });
        console.log('      - updated rule', rule._id.toString(), '+', result.nModified, 'history documents for rule', );
      } else {
        const ruleHistory = await RuleHistory.find({ ruleID: rule._id });
        console.log('      - updated rule', rule._id.toString(), '+', ruleHistory.length, 'history documents for rule', );
      }
    }
  }

  function moveCertificate({ oldUserId, newUserId, certificateId }) {
    const oldDirectory = `${__dirname}/../../files/users/${oldUserId}/certificates/${certificateId}`;
    const newDirectory = `${__dirname}/../../files/users/${newUserId}/certificates/${certificateId}`;
    fs.mkdirSync(`${__dirname}/../../files/users/${newUserId}/certificates`, { recursive: true });
    fs.renameSync(oldDirectory, newDirectory);
  }

  console.log('\n------------------');
  console.log('Starting migration');
  console.log('------------------');
  console.log(`This is ${dryRun ? '' : 'NOT '}a dry run`);

  try {

    // Update Certificates
    for (const [certificateId, companyIdentifier] of Object.entries(migrationCertificates)) {
      const certificate = await Certificate.findOne({ _id: certificateId });
      const oldUserRef = certificate.user;
      console.log(`\n- moving certificate ${certificateId} (${certificate.name}) to ${companyIdentifier}`);
      const email = emailForCompanyIdentifier(companyIdentifier);
      const newUser = await User.findOne({ 'local.email': email })
      let certificateName = certificate.name;
      if (dryRun === false) {
        try {
          await Certificate.findOneAndUpdate({ _id: certificateId }, { user: newUser });
        } catch (error) {
          if (error.codeName === 'DuplicateKey') {
            certificateName = certificate.name + ' (2)';
            console.log(`  - renaming certificate "${certificate.name}" to "${certificateName}"`);
            await Certificate.findOneAndUpdate({ _id: certificateId }, {
              user: newUser,
              name: certificateName,
            });
          } else {
            throw error;
          }
        }
      }
      if (dryRun === false) {
        moveCertificate({
          certificateId: certificate._id.toString(),
          oldUserId: oldUserRef.toString(),
          newUserId: newUser._id.toString(),
        });
      }
      await updateRulesByAccountPath({
        oldPath: pathFromComponents(['user', oldUserRef.toString(), 'credential', 'apple_search_ads', certificate.name]),
        newPath: pathFromComponents(['user', newUser._id.toString(), 'credential', 'apple_search_ads', certificateName]),
        newUser,
        newAccountName: certificateName,
      });
    }

    // Update Credentials
    for (const [credentialId, companyIdentifier] of Object.entries(migrationCredentials)) {
      const credential = await Credential.findOne({ _id: credentialId });
      const oldUserRef = credential.user;
      console.log(`\n- moving credential ${credentialId} (${credential.name}) to ${companyIdentifier}`);
      const email = emailForCompanyIdentifier(companyIdentifier);
      const newUser = await User.findOne({ 'local.email': email })
      let credentialName = credential.name;
      if (dryRun === false) {
        try {
	  await Credential.findOneAndUpdate({ _id: credentialId }, { user: newUser });
        } catch (error) {
          if (error.codeName === 'DuplicateKey') {
            credentialName = credential.name + ' (2)';
            console.log(`\n  - renaming credential "(${credential.name})" to "${credentialName}"`);
	    await Credential.findOneAndUpdate({ _id: credentialId },{
              user: newUser,
              name: credentialName,
            });
          } else {
            throw error;
          }
        }
      }
      await updateRulesByAccountPath({
        oldPath: pathFromComponents(['user', oldUserRef.toString(), 'credential', credential.target, credential.name]),
        newPath: pathFromComponents(['user', newUser._id.toString(), 'credential', credential.target, credentialName]),
        newUser,
        newAccountName: credentialName,
      });
    }

  } catch(error) {
    console.error(error);
    console.error('\naborting.');
    return;
  }

  console.log('\ndone');

}
