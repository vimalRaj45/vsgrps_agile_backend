const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'google-credentials.json');

let auth;
let calendar;

if (fs.existsSync(CREDENTIALS_PATH)) {
  try {
    auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    calendar = google.calendar({ version: 'v3', auth });
    console.log('✅ Google Calendar Service Account configured successfully.');
  } catch (err) {
    console.error('❌ Failed to configure Google Calendar Auth:', err.message);
  }
} else {
  console.log('⚠️ No google-credentials.json found. Google Calendar integration is disabled.');
}

/**
 * Creates a Google Calendar event with an auto-generated Google Meet link.
 * @param {string} title - The title of the meeting.
 * @param {string} description - The agenda or description.
 * @param {Date} startTime - The start time of the meeting.
 * @param {string[]} attendeeEmails - List of emails of attendees to invite.
 * @returns {Promise<string|null>} - Returns the Google Meet link (hangoutLink) or null if failed/disabled.
 */
async function createCalendarEventWithMeet(title, description, startTime, attendeeEmails = []) {
  if (!calendar) {
    return null;
  }

  // Assuming meetings are 1 hour long for now, as scheduled_at doesn't have an end time in the schema
  const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000);

  const event = {
    summary: title,
    description: description,
    start: {
      dateTime: new Date(startTime).toISOString(),
    },
    end: {
      dateTime: endTime.toISOString(),
    },
    attendees: attendeeEmails.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: uuidv4(),
        conferenceSolutionKey: {
          type: 'hangoutsMeet'
        }
      }
    }
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1, // Required to generate the Meet link
      sendUpdates: 'all', // Send email notifications to attendees
    });

    console.log('✅ Google Calendar Event Created:', response.data.htmlLink);
    return response.data.hangoutLink || null;
  } catch (error) {
    console.error('❌ Error creating Google Calendar event:', error.message);
    return null;
  }
}

module.exports = {
  createCalendarEventWithMeet,
  isCalendarEnabled: () => !!calendar
};
