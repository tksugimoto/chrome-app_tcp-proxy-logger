document.getElementById("createServer").addEventListener("click", () => {

	var localPort = (() => {
		var elem = document.getElementById("localPort");
		return elem.value || elem.placeholder;
	})();

	var targetAddress = (() => {
		var elem = document.getElementById("targetAddress");
		return elem.value || elem.placeholder;
	})();

	var targetPort = (() => {
		var elem = document.getElementById("targetPort");
		return elem.value || elem.placeholder;
	})();
	
	var query = (() => {
		var obj = {
			localAddress: "127.0.0.1",
			localPort,
			targetAddress,
			targetPort
		};
		return Object.keys(obj).map(key => {
			return key + "=" + obj[key];
		}).join("&");
	})();

	chrome.app.window.create("server.html?" + query, {
		id: query,
		bounds: {
			width:  500,
			height: 300,
			top:  0,
			left: 0
		}
	});
});

document.getElementById("closeAllConnection").addEventListener("click", () => {
	chrome.sockets.tcp.getSockets(socketInfos => {
		socketInfos.forEach(info => {
			chrome.sockets.tcp.close(info.socketId)
		})
	});

	chrome.sockets.tcpServer.getSockets(socketInfos => {
		socketInfos.forEach(info => {
			chrome.sockets.tcpServer.close(info.socketId)
		});
	});
});
