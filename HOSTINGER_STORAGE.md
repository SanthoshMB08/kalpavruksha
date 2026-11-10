# Hostinger image storage

The Express application can run locally at `http://localhost:3000` while its public images are uploaded directly to Hostinger over verified explicit FTPS. FTP credentials are read only by the backend.

## Configure

1. Keep your existing `.env` file. Add or update only the following values using your Hostinger hPanel details:

   ```dotenv
   PORT=3000
   STORAGE_PROVIDER=hostinger-ftp
   HOSTINGER_FTP_HOST=your-ftp-host
   HOSTINGER_FTP_PORT=21
   HOSTINGER_FTP_USER=your-ftp-user
   HOSTINGER_FTP_PASSWORD=your-ftp-password
   HOSTINGER_FTP_SECURE=true
   HOSTINGER_FTP_ROOT=.
   HOSTINGER_FTP_PUBLIC_URL=https://your-domain.example
   PRIVATE_STORAGE_PROVIDER=local
   # Optional; must resolve outside the app's public/ directory.
   # PRIVATE_STORAGE_DIR=C:/a/persistent/private-uploads
   ```

   Use the FTP hostname, username, and password from hPanel; never put them in browser JavaScript or commit `.env`. The TLS certificate must match `HOSTINGER_FTP_HOST`; if Hostinger's certificate does not cover the supplied IP address, use its matching FTP hostname rather than weakening certificate verification. The provided FTP account is rooted at `public_html`, so `HOSTINGER_FTP_ROOT=.` creates `uploads/...` within that root. If your FTP login instead starts one directory above `public_html`, set `HOSTINGER_FTP_ROOT=public_html`.

2. Ensure the domain has HTTPS enabled and matches `HOSTINGER_FTP_PUBLIC_URL`.
3. Run `npm run dev`. The app remains local; only image files are sent to Hostinger.

FTPS and certificate verification are mandatory. The application rejects `HOSTINGER_FTP_SECURE=false` and never falls back to plaintext FTP.

## Uploads and frontend URLs

| App upload | Hostinger folder | Public URL |
|---|---|---|
| Profile photos | `uploads/profiles/` | `<HOSTINGER_FTP_PUBLIC_URL>/uploads/profiles/<generated-name>` |
| Advertisement images | `uploads/advertisements/` | `<HOSTINGER_FTP_PUBLIC_URL>/uploads/advertisements/<generated-name>` |
| Success-story images (provider-ready; no current upload form) | `uploads/success-stories/` | `<HOSTINGER_FTP_PUBLIC_URL>/uploads/success-stories/<generated-name>` |

The application validates image type and signature, limits images to 5 MB, generates random names, and uploads multiple images in one FTPS connection per bucket. Stored names are passed through the existing EJS image URL helper, so the browser loads them from your HTTPS site domain.

## Private biodata and jathaka PDFs

PDFs are **not uploaded to Hostinger FTP** and are never placed under `public_html/uploads`. New files are stored under `PRIVATE_STORAGE_DIR` (default: project `private-uploads/`, outside `public/`) and served only through an admin-protected route after confirming a matching database reference. The public static route also blocks the legacy `/uploads/biodata` and `/uploads/jathaka` folders.

This private directory is on the Node application's filesystem; it is not private Hostinger FTP storage or a remote backup. When deploying the Node app, configure a persistent private path outside the web root and verify it is not publicly served. The supplied FTP account's access outside `public_html` has not been verified. Ask Hostinger whether a separate FTP account or private storage outside the document root is available before using it for confidential documents.

Existing PDFs under `public/uploads/biodata` or `public/uploads/jathaka` are not deleted automatically. Back them up, then copy referenced legacy files into private storage with:

```powershell
npm run migrate-private-documents
```

Set `PRIVATE_STORAGE_DIR` first if the destination must be somewhere other than `private-uploads/`. The command copies only PDFs referenced by profile records, preserves filenames, verifies existing destination files, and does not delete the originals. Verify the protected admin links before manually removing any old public copies. If legacy files exist only on a remote FTP host, securely download them into the matching local folders first; the script does not connect to or clean up legacy public FTP files.

## Manual verification

To check your live Hostinger account, configure the environment and:

1. Start the server with `npm run dev` and sign in to the local admin dashboard.
2. Create or edit a profile and upload a profile photo. Create an advertisement and upload desktop/mobile images.
3. Confirm each upload succeeds and its image displays in the local UI.
4. Open the image URL in a browser. Confirm it uses `HOSTINGER_FTP_PUBLIC_URL` and returns the image over HTTPS.
5. In Hostinger File Manager or FTP, confirm the generated file exists under the corresponding `public_html/uploads/...` folder.
6. Attempt a non-image upload in an image field and an image larger than 5 MB; both should be rejected. Check that PDF uploads are not present in the Hostinger upload folders.

To switch back to local public image storage, set `STORAGE_PROVIDER=local`. Before switching providers, migrate or otherwise verify referenced images because database records store filenames rather than provider-specific URLs.
