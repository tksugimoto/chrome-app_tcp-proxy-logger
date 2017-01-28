var logEnabled = false;
var logBinaryEnabled = false;

document.getElementById("log-enable").addEventListener("change", evt => {
	logEnabled = evt.target.checked;
});

document.getElementById("log-binary-enable").addEventListener("change", evt => {
	logBinaryEnabled = evt.target.checked;
});



var settings = {};
location.search.slice(1).split("&").forEach(str => {
	if (str.match(/^([^=]+)=(.*)$/)) {
		var key = RegExp.$1;
		var value = RegExp.$2;
		if (/^\d+$/.test(value)) {
			value = parseInt(value);
		}
		settings[key] = value;
	}
});

document.getElementById("localInfo").innerText = settings.localAddress + ":" + settings.localPort;
document.getElementById("targetInfo").innerText = settings.targetAddress + ":" + settings.targetPort;


Promise.resolve()
.then(closeIfAlreadyListen)
.then(createTcpServer)
.then(setEvents)
.catch(catchError);

/******************************************/

function closeIfAlreadyListen() {
	return new Promise(resolve => {
		chrome.sockets.tcpServer.getSockets(sockets => {
			var address = settings.localAddress;
			var port = settings.localPort;
			var socket = sockets.find(socket => {
				return socket.localAddress === address && socket.localPort === port;
			});
			if (socket) {
				chrome.sockets.tcpServer.close(socket.socketId, resolve);
			} else {
				resolve();
			}
		});
	});
}

function createTcpServer() {
	return new Promise((resolve, reject) => {
		chrome.sockets.tcpServer.create(createInfo => {
			console.log("chrome.sockets.tcpServer.create", createInfo);
			var socketId = createInfo.socketId;
			var address = settings.localAddress;
			var port = settings.localPort;
			chrome.sockets.tcpServer.listen(socketId, address, port, result => {
				if (result < 0) {
					reject("chrome.sockets.tcpServer.listen: result = " + result);
				} else {
					resolve(socketId);
				}
			});
		});
	});
}

function setEvents(serverSocketId) {
	var fromLocalSockets = new Set();
	var socketIdPair = new Map();

	chrome.sockets.tcpServer.onAccept.addListener(info => {
		if (info.socketId === serverSocketId) {
			var clientSocketId = info.clientSocketId;
			var paused = false;
			fromLocalSockets.add(clientSocketId);
			chrome.sockets.tcp.setPaused(clientSocketId, paused);
		}
	});
	chrome.sockets.tcpServer.onAcceptError.addListener(info => {
		if (info.socketId === serverSocketId) {
			console.warn(`chrome.sockets.tcpServer.onAcceptError(${serverSocketId}): resultCode = ${info.resultCode}`);
		}
	});
	chrome.sockets.tcp.onReceiveError.addListener(info => {
		var socketId = info.socketId;
		if (socketIdPair.has(socketId)) {
			console.debug(`chrome.sockets.tcp.onReceiveError(${socketId}: fromRemote = ${!fromLocalSockets.has(socketId)}): resultCode = ${info.resultCode}`);
			[socketId, socketIdPair.get(socketId)].forEach(id => {
				socketIdPair.delete(id);
				fromLocalSockets.delete(id);
				chrome.sockets.tcp.close(id);
			});
		}
	});

	chrome.sockets.tcp.onReceive.addListener(info => {
		var socketId = info.socketId;
		if (fromLocalSockets.has(socketId)) {
			// local→remote
			var localSocketId = socketId;
			if (socketIdPair.has(socketId)) {
				// すでにある接続を利用
				var remoteSocketId = socketIdPair.get(socketId);
				chrome.sockets.tcp.send(remoteSocketId, info.data, sendInfo => {
					if (logEnabled) {
						var requestText = arrayBuffer2string(info.data);
						console.log("local[" + socketId + "] -> remote[" + remoteSocketId + "]", requestText.length, requestText.split("\n")[0]);
						if (logBinaryEnabled) {
							new Uint8Array(info.data).forEach((value, i) => {
								console.debug(`${i}: ${value}`);
							});
						} else {
							console.debug(requestText);
						}
					}
				});
			} else {
				chrome.sockets.tcp.create(createInfo => {
					var remoteSocketId = createInfo.socketId;
					var address = settings.targetAddress;
					var port = settings.targetPort;

					chrome.sockets.tcp.connect(remoteSocketId, address, port, result => {
						if (result < 0) {
							console.error(`chrome.sockets.tcp.connect failed: ${address}:${port}`);
						} else {
							socketIdPair.set(remoteSocketId, localSocketId);
							socketIdPair.set(localSocketId, remoteSocketId);

							chrome.sockets.tcp.send(remoteSocketId, info.data, sendInfo => {
								if (logEnabled) {
									var requestText = arrayBuffer2string(info.data);
									console.log("local[" + localSocketId + "] -> remote[" + remoteSocketId + "]", "new", requestText.length, requestText.split("\n")[0]);
									if (logBinaryEnabled) {
										new Uint8Array(info.data).forEach((value, i) => {
											console.debug(`${i}: ${value}`);
										});
									} else {
										console.debug(requestText);
									}
								}
							});
						}
					});
				});
			}
		} else if (socketIdPair.has(socketId)) {
			// remote→local
			var remoteSocketId = socketId;
			var localSocketId = socketIdPair.get(socketId);
			chrome.sockets.tcp.send(localSocketId, info.data, sendInfo =>  {
				if (logEnabled) {
					var requestText = arrayBuffer2string(info.data);
					console.debug("remote[" + remoteSocketId + "] -> local[" + localSocketId + "]", "reuse", requestText.length, requestText.split("\n")[0]);
					if (logBinaryEnabled) {
						new Uint8Array(info.data).forEach((value, i) => {
							console.debug(`${i}: ${value}`);
						});
					} else {
						console.debug(requestText);
					}
				}
			});
		}
	});
}

function catchError(err) {
	console.error(err);
}

function arrayBuffer2string(arrayBuffer) {
	var uint8Array = new Uint8Array(arrayBuffer);
	return new TextDecoder("utf-8").decode(uint8Array);
}
