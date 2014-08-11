var Cul = require('cul');
var adapter = require(__dirname + '/../../lib/adapter.js')({

    name:           'cul',

    objectChange: function (id, obj) {

    },

    stateChange: function (id, state) {

    },

    unload: function (callback) {
        cul.close();
        callback();
    },

    ready: function () {

        var options = {
            serialport:     adapter.config.serialport   || '/dev/ttyACM0',
            baudrate:       adapter.config.baudrate     || 9600,
            mode:           adapter.config.mode         || 'SlowRF'
        };

        var cul = new Cul(options);

        cul.on('data', function (raw, obj) {

        });

    }

});

