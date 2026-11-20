# RasoiOS — Kitchen SOPs

Sidebar → **Kitchen SOPs** (`/sop`). Built from the "RasoiOS: Feature Comparison and
Idea Assessment" list. Uses Annapurna's existing outlets, staff, roles and notifications.

| Feature from the assessment | Where |
|---|---|
| Step-by-step dish SOPs, photo per step, chef's voice note | Dish SOPs → New SOP / open a dish |
| Hindi + English (also Gujarati, Marathi) | Every piece of SOP text has an English and a second-language box; cooks switch language on the SOP |
| Regular / Jain variant swap → general variant engine (Jain, Vegan, No onion-garlic, Less spicy, Gluten-free, Nut-free, custom) | Each ingredient/step: *Same / Leave out / Change to…*; changed lines turn green for that variant |
| Packaging and accompaniments per dish, plating | SOP editor sections |
| Share one SOP on WhatsApp | **WhatsApp** button: recipe as text + read-only public link `/s/sop/<token>` (no quiz answers) |
| Daily checklists with audit trail | Checklists tab — who ticked what and when; Past 14 days shows every change |
| Hygiene / temperature logs | Checklist items of type *Temperature* with a safe range; out-of-range readings alert managers |
| AMC and licence tracking + reminders | Licences & AMC tab (FSSAI, Fire NOC, trade licence, pest control…); reminders before expiry |
| Delivery channel playbooks (templates each kitchen fills in) | Delivery playbooks tab — Zomato / Swiggy / own delivery starter templates |
| Staff acknowledgement + quizzes | "I have read this" per SOP version; optional quiz, 80% to pass |
| SOP versioning, change history, alerts on change | Every save is a new version with a note; staff are notified and must re-read |
| Reminders | Overdue checklists (after their due time) and licences/AMCs (N days before expiry) — bell notifications |
| Starter content library | Dish SOPs → Starter library (6 dishes in English/Hindi/Gujarati with Jain/Vegan swaps); starter checklists, playbooks and licences |
| Fast SOP capture | Paste many steps at once; microphone dictation in Hindi / Gujarati / Marathi / English (Chrome, Edge, Android) |
| Multi-outlet owner dashboard | Outlets tab — checklists done, overdue, temperature alerts, licences, training % per outlet |

Already in Annapurna (not rebuilt): food costing & recipes, auto stock deduction, POS,
aggregator integration, vendor directory (Inventory → Suppliers), multi-outlet.

Not built: AI photo-to-SOP (needs an AI provider key), full offline mode.

**Permissions:** `sop.view` (read SOPs, sign off, fill checklists) and `sop.manage`
(write SOPs, checklists, playbooks, licences; see training and outlets). The migration
grants `sop.view` to the built-in staff roles and `sop.manage` to Manager and Chef of
existing restaurants; change it under Settings → Roles.
