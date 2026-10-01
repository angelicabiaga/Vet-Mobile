# Vet Schedule: Leave & Emergency (mobile)

The Schedule tab now lets a veterinarian request leave, report a same-day
emergency, and track their requests. Rules and data are shared with the web
app; see `VET_SCHEDULE_LEAVE_SETUP.md` in the web project (final-vet).

Requires `supabase/VET_LEAVE_REQUESTS.sql` from the web project to be run
once in Supabase. Until then the tab keeps its previous read-only view and
shows a notice.

- `src/api/vetLeaveService.js`: calls the leave RPCs, plus display helpers.
- `VetSchedule.js` ("My Schedule", like the web): Today card with Request
  leave / Emergency leave, week stats, My Weekly Schedule browsed one week at
  a time (26 weeks back and ahead; needs the web's
  `supabase/VET_SCHEDULE_CALENDAR.sql`, otherwise it shows the days from
  today), My Leave Requests (withdraw / cancel).
- `VetLeaveRequestModal.js`: the request form with a live conflict check.
  Part-day and emergency times stay inside the vet's own shift (Dr. Redmond
  9 AM – 5 PM, Dr. Neil 11 AM – 7 PM).
- `NotificationProvider.js`: leave and schedule notifications open the
  Schedule tab.
- `mobileAppointmentService.getAvailableSlots`: stops at the vet's own
  schedule end (so a "leave early" day hides later slots) and skips times
  that already passed today, matching the web app. Times held for another
  owner's pending doctor change are not offered.

## Doctor change (pet owner, My Queue)

Requires `supabase/QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql` from the web project.
When the booked doctor can't see a visit (leave or emergency) and staff offer
another doctor, the owner's Queue tab shows the reason, the offered doctor and
time, and **Confirm**, **Reschedule** (date, then time and doctor) or
**Cancel visit**. A ticket on hold stays out of the queue summary until the
owner confirms.

- `src/api/doctorOfferService.js`: loads the owner's pending offers and sends
  their answer.
- `PetOwnerQueue.js`: the offer card; refreshes live on offer changes.
- `NotificationProvider.js`: "Queue Update" notifications open the Queue tab.
