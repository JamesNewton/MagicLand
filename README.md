This is a combination of a few things which makes a very flexible, but simple, documentation / UI system. It is based on prior experience with the [SDMG Web Bot](https://github.com/JamesNewton/SDMG-Web-Bot?tab=readme-ov-file#additional-features) The focus is on simplicity; avoiding huge installs or dependancies, while taking advantage of the power of modern browsers (e.g. chrome).

- A tiny web server (basic node js, plus one NPM module: 'formidable')
- The ace browser based code editor; or at least an old version of it.
- A custom wysiwyg html editor, with a syncronized html display / edit window (inwork)
- Support for http GET, POST, PUT, and DELETE methods to edit the files on the local drive via the web server using the editors.

So you fire this up and have access to a local copy of your web site and code files, can edit them (wsywig for html, ace for code) and browse them, and when you are done, use git or whatever for version control and (optionally) publishing.

Because it's a local server, this can be expanded to interact with local devices on the server, such as serial ports, cameras, or whatever you want to add. Even if the server can't support https, this avoids the security limits enforced by the browser.
Critically, it's easy to edit the web pages which can act as the UI to the devices; it's all in one. Or that's the future dream. For now, it's just a way to have the local editing of a large site which I had with MassMind and AOLpress. 
