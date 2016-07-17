chrome.app.runtime.onLaunched.addListener(function(launchData) {
	chrome.app.window.create("app.html", {
		id: "-",
		bounds: {
			width:  500,
			height: 300,
			top:  0,
			left: 0
		}
	});
});
