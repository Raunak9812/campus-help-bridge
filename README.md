# Campus Help Bridge

**A student-led academic resource-sharing platform** created and developed by **Raunak Yadav**.

Campus Help Bridge helps students discover and share academic resources such as textbooks, notes, previous-year questions, and other learning materials. The platform is designed around university, semester, and subject-based discovery, with student-to-student interaction features.

## Live website

https://kaleidoscopic-biscotti-8cff41.netlify.app/

## Project creator

**Raunak Yadav** — Creator and Developer of Campus Help Bridge.

## Main features

- Browse and list academic resources.
- Explore resources by university, semester, and subject.
- Share books, notes, PYQs, and other permitted learning materials.
- Optional external resource links on listings.
- Student profiles, conversations, and resource-related interactions.
- Community ratings and written reviews.
- Consultation requests with accept/decline flow and meeting links.

> Availability of individual features in a deployment depends on the matching Supabase database schema, authentication settings, and project configuration.

## Technology

- HTML5
- CSS3
- JavaScript
- Supabase (authentication, database, and storage)
- Netlify (static hosting)

## Repository structure

- `index.html` — main website page and app shell
- `about.html` — project and creator information
- `styles.css` — website styling
- `app.js` — main frontend application logic
- `app-enhancements.js` — additional frontend interactions
- `supabase-backend.js` — Supabase integration layer
- `supabase-config.js` — local Supabase configuration template
- `netlify.toml` — Netlify configuration
- `robots.txt` and `sitemap.xml` — search engine crawling files
- `favicon-96.png` — site icon

## Run locally

1. Download or clone this repository.
2. Open `supabase-config.js`.
3. Replace `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with the URL and public publishable/anon key from your own Supabase project.
4. Serve the folder using a local static web server. Do not open the page using a `file://` URL if your browser blocks module or network requests.
5. Configure the required Supabase tables, Row Level Security policies, authentication providers, and storage policies in your own Supabase project.

## Security notes

- The checked-in `supabase-config.js` contains placeholders only.
- Never commit service-role keys, secret keys, passwords, access tokens, private student contact data, database backups, or private exports.
- Browser code must use only a Supabase publishable/anon key. Protect data with Row Level Security policies and least-privilege database grants.
- Do not upload private backups or real student data to this public repository.

## Project status

This repository contains the frontend source and deployment-related public files for the Campus Help Bridge project. Backend-dependent features require a correctly configured Supabase project.

---

© Raunak Yadav. No open-source license is granted unless a license file is added to this repository.
