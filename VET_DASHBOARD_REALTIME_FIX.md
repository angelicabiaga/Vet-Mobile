# Veterinarian Realtime Fix

Fixed the `cannot add postgres_changes callbacks ... after subscribe()` error by:
- creating a unique veterinarian appointment channel per mount;
- keeping the subscription dependency stable to the veterinarian;
- removing the channel on unmount;
- adding a 15-second fallback refresh.

The Vet Dashboard now reads the same Supabase appointments, queue entries,
medical records, and activity logs as the web system and refreshes through Realtime.
