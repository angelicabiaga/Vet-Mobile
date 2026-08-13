# Vet Patients + Sidebar Update

- Removed hard-coded Vet patient samples (Buddy, Luna, Max).
- Vet Patients now reads the same active `pets` rows and owner profiles used by the web.
- Patient cards also use shared appointment and medical-record data for last visit/status/counts.
- Patients refresh through Supabase Realtime with a 15-second fallback.
- Opening a patient filters the Veterinarian Medical Records screen to that pet.
- Removed Notifications and Profile from both Veterinarian and Pet Owner sidebars.
- The notification bell and profile button in each top header remain functional.
