var http = require('http');
var server = http.createServer(function(request, response) {});
var WebSocketServer = require('websocket').server;
var WebSocketClient = require('websocket').client;

var numClients = 0;
var conClients = {}; 
var sdlConnection = {};
var registeredComponents = {};
var sdlWebsocket = new WebSocketClient();

/*
// Connection to Core. This application is treated
// as the client in the implementation.
*/
sdlWebsocket.on('connect', function(connection) {
    console.log('Connected to SDL');
    sdlConnection = connection;
    sdlConnection.on('message', function(message) {
        var msg = message.utf8Data;
        //console.log(msg);
        forwardToClients(msg);
    });
});

sdlWebsocket.connect('ws://localhost:8087');

/*
// Creating websocket server to allow connections
// from different HMI Clients. This app will track
// HMI component registration and will block clients 
// from sending duplicate component registerations 
// to SDL Core.
*/

var wsServer = new WebSocketServer({
    httpServer: server
});

wsServer.on('request', function(hmi){

    var connection = hmi.accept('echo-protocol', hmi.origin);
    console.log("Client Connected");
    var id = numClients++;
    conClients[id] = connection;
    conClients[id].registeredComponents = {};

    connection.on('message', function(message) {
        var msg = message.utf8Data;
        var rpc = JSON.parse(msg);
        console.log(msg);
        switch(rpc.method)  {
            case "MB.registerComponent":
                if(!(rpc.params.componentName in registeredComponents)) {
                    console.log("Registering Component: " + rpc.params.componentName);
                    registeredComponents[rpc.params.componentName] = true;
                    addObserver(id, rpc.params.componentName);
                    forwardToSDL(msg);
                } else {
                    console.log("Component Already Registered");
                    console.log("Adding Client As Observer For" + rpc.params.componentName);
                    addObserver(id, rpc.params.componentName);
                }
                break;
            default:
                forwardToSDL(msg);
                break;
        }
    });

    connection.on('close', function(reasonCode, description) {
        delete conClients[id];
        console.log("Client Disconnected " + id);
        console.log(conClients);
    });
});

/*
// Forward all messages to SDL Core from any
// connected client without filtering.
*/

function forwardToSDL(msg) {
    sdlConnection.send(msg);
}

/*
// Only forward component messages to clients
// that have previously registered the
// corresponding component. 
*/

function forwardToClients(msg) {
    var componentName = undefined;
    for(var i in conClients) {
        var rpc = JSON.parse(msg);
        if(rpc.method) {
            componentName = rpc.method.split(".")[0];
            console.log("Extracted Component Name: " + componentName);
            if(conClients[i].registeredComponents[componentName] == true) {
                conClients[i].send(msg);
            }
        } else {
            componentName = undefined;
            conClients[i].send(msg);
        }
    }
}

function addObserver(id, component) { 
    if(!(component in conClients[id].registeredComponents)) {
        conClients[id].registeredComponents[component] = true;
        console.log("Adding Client " + id + " as observer for component " + component);
    }
}


server.listen(8086);