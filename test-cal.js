const { createCalendarEventWithMeet } = require('./utils/calendar');

(async () => {
  try {
    const link = await createCalendarEventWithMeet("Test Meeting", "Test description", new Date().toISOString(), ["test@example.com"]);
    console.log("SUCCESS. Link:", link);
  } catch (e) {
    console.error("FAILED:", e);
  }
})();
