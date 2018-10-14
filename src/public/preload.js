/* globals Meteor, Tracker, RocketChat, UserPresence*/
const { ipcRenderer, shell } = require('electron');
const path = require('path');
const Notification = require('./lib/Notification');
const SpellCheck = require('./lib/SpellCheck');
const i18n = require('../i18n/index');

window.Notification = Notification;
window.i18n = i18n;

const defaultWindowOpen = window.open;

function customWindowOpen(url, frameName, features) {
	const jitsiDomain = RocketChat.settings.get('Jitsi_Domain');
	if (jitsiDomain && url.indexOf(jitsiDomain) !== -1) {
		features = `${ (features) ? (`${ features },`) : ''
		}nodeIntegration=true,preload=${ path.join(__dirname, 'jitsi-preload.js') }`;
		return defaultWindowOpen(url, frameName, features);
	} else {
		return defaultWindowOpen(url, frameName, features);
	}
}

window.open = customWindowOpen;

const events = ['unread-changed', 'get-sourceId', 'user-status-manually-set'];

events.forEach(function(e) {
	window.addEventListener(e, function(event) {
		ipcRenderer.sendToHost(e, event.detail);
	});
});

const userPresenceControl = () => {
	const INTERVAL = 10000; // 10s
	setInterval(() => {
		try {
			const idleTime = ipcRenderer.sendSync('getSystemIdleTime');
			if (idleTime < INTERVAL) {
				UserPresence.setOnline();
			}
		} catch (e) {
			console.error(`Error getting system idle time: ${ e }`);
		}
	}, INTERVAL);
};

const changeSidebarColor = () => {
	const sidebar = document.querySelector('.sidebar');
	const fullpage = document.querySelector('.full-page');
	if (sidebar) {
		const sidebarItem = sidebar.querySelector('.sidebar-item');
		let itemColor;
		if (sidebarItem) {
			itemColor = window.getComputedStyle(sidebarItem);
		}
		const { color, background } = window.getComputedStyle(sidebar);
		ipcRenderer.sendToHost('sidebar-background', { color: itemColor || color, background });
	} else if (fullpage) {
		const { color, background } = window.getComputedStyle(fullpage);
		ipcRenderer.sendToHost('sidebar-background', { color, background });
	} else {
		window.requestAnimationFrame(changeSidebarColor);
	}
};

ipcRenderer.on('request-sidebar-color', changeSidebarColor);

window.addEventListener('load', function() {
	if (!Meteor) {
		return;
	}

	Meteor.startup(function() {
		Tracker.autorun(function() {
			const siteName = RocketChat.settings.get('Site_Name');
			if (siteName) {
				ipcRenderer.sendToHost('title-changed', siteName);
			}
		});
	});
	userPresenceControl();
});

window.onload = () => {
	document.addEventListener('click', (event) => {
		const anchorElement = event.target.closest('a');

		if (!anchorElement) {
			return;
		}

		const { href } = anchorElement;

		// Check href matching current domain
		if (RegExp(`^${ location.protocol }\/\/${ location.host }`).test(href)) {
			return;
		}

		// Check if is file upload link
		if (/^\/file-upload\//.test(href) && !anchorElement.hasAttribute('download')) {
			const tempElement = document.createElement('a');
			tempElement.href = href;
			tempElement.download = 'download';
			tempElement.click();
			return;
		}

		// Check href matching relative URL
		if (!/^([a-z]+:)?\/\//.test(href)) {
			return;
		}

		if (/^file:\/\/.+/.test(href)) {
			const item = href.slice(6);
			shell.showItemInFolder(item);
			event.preventDefault();
			return;
		}

		shell.openExternal(href);
		event.preventDefault();
	}, true);

	window.reloadServer = () => ipcRenderer.sendToHost('reload-server');
};

// Prevent redirect to url when dragging in
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => event.preventDefault());

const spellChecker = new SpellCheck();
spellChecker.enable();
