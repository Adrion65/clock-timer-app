# companion-module-clocktimer-app

A Bitfocus Companion module for the Clock & Timer desktop app. It talks to the app's local
remote-control address (default `http://127.0.0.1:8787`) and needs no internet.

Built for module API 2.0, which runs on Companion 4.3 and newer.

You need Node.js (you already have it for the Clock & Timer app). Run the commands below from
inside this folder.

## Option A: build a .tgz package and load it on the Modules page

1. Install the libraries (needs internet once):

       npm install

2. Build the package:

       npm run package

   This makes a `pkg` folder and a file ending in `.tgz` in this folder.
3. In Companion's web interface, open the **Modules** page and load that `.tgz` file
   (look for an import or add-package button there).
4. Go to **Connections**, add a connection, and search for "Clock & Timer app".

## Option B: load it from a development folder (no .tgz needed)

1. Run `npm install` in this folder.
2. Make a folder for development modules (for example `companion-dev-modules`) and put this
   whole `companion-module-clocktimer-app` folder inside it. The setting below must point at the
   folder that contains module folders, not at this folder itself.
3. In the Companion launcher, click the cog to open **Advanced Settings**. In the **Developer**
   section click **Select** and choose `companion-dev-modules`, then switch on
   **Enable Developer Modules**.
4. Open the web interface (**Launch GUI**), go to **Connections**, add a connection, and search
   for "Clock & Timer app". If it doesn't appear, check Companion's log.

Companion restarts the connection when you edit a file in this folder.

## Then

Start the Clock & Timer app. The connection should turn green. Open **Presets** and drag
buttons onto your pages.

## Files

- `main.js` is the module (config, actions, feedbacks, variables, presets).
- `companion/manifest.json` and `companion/HELP.md` describe it to Companion.
- `package.json` lists the two Companion libraries it needs and the `package` script.

Before sharing the module with others, replace the placeholder `repository`, `bugs` and
`maintainers` values in `companion/manifest.json`.
