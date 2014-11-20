/*globals cartodb, L, moment: true */

$(function(){
  var permitsTemplate = _.template($('#template-permits').html());
  var permitTypesTemplate = _.template($('#template-permit-types').html());

  var sql = new cartodb.SQL({ user: 'localdata' });

  var TABLE_NAME = 'permits_2014_nyc';

  var JOB_TYPES = {
    'A': 'PRE-FILING',
    'B': 'APPLICATION PROCESSED - PART-NO PAYMENT',
    'C': 'APPLICATION PROCESSED - PAYMENT ONLY',
    'D': 'APPLICATION PROCESSED - COMPLETED',
    'E': 'PROCESSED - NO PLAN EXAM',
    'F': 'APPLICATION ASSIGNED TO PLAN EXAMINER',
    'G': 'PAA FEE DUE',
    'H': 'PLAN EXAM - IN PROCESS',
    'I': 'SIGN-OFF (ARA)',
    'J': 'PLAN EXAM - DISAPPROVED',
    'K': 'PLAN EXAM - PARTIAL APPROVAL',
    'L': 'P/E PAA - PENDING FEE ESTIMATION',
    'M': 'P/E PAA - FEE RESOLVED',
    'P': 'PLAN EXAM - APPROVED',
    'Q': 'PERMIT ISSUED - PARTIAL JOB',
    'R': 'PERMIT ISSUED - ENTIRE JOB/WORK',
    'U': 'COMPLETED',
    'X': 'SIGNED-OFF',
    '3': 'SUSPENDED'
  };

  var PERMIT_TYPES = {
    'AL': 'Alteration',
    'FO': 'Foundation/earthwork',
    'DM': 'Demolition & removal',
    'EQ': 'Construction equipment ',
    'PL': 'Plumbing',
    'SG': 'Sign',
    'EW': 'Equipment work',
    'NB': 'New building'
  };

  var PERMIT_SUBTYPES = {
    'NB': 'New Building',
    'CH': 'Chute ',
    'FN': 'Fence ',
    'SH': 'Sidewalk shed',
    'SF': 'Scaffold',
    'OT': 'Other Construction Equipment',
    'BL': 'Boiler',
    'FA': 'Fire Alarm',
    'FB': 'Fuel Burning',
    'FP': 'Fire Suppression',
    'FS': 'Fuel Storage',
    'MH': 'Mechanical/HVAC',
    'OT': 'Other-General Construction, partitions, marquees, BPP (Builder Pavement Plan), etc.',
    'SD': 'Stand pipe',
    'SP': 'Sprinkler'
  };

  function prepPermits(permits) {
    var prepped = [];
    _.each(permits, function(permit) {
      // Dateize
      permit.job_start_date = moment(permit.job_start_date).format('ll');
      permit.expiration_date = moment(permit.expiration_date).format('ll');
      permit.issuance_date =  moment(permit.issuance_date).format('ll');

      // Change case
      var lowercase = [
        'street_name',
        'owner_s_first_last_name',
        'owner_s_business_name',
        'permittee_s_business_name'
      ];
      _.each(lowercase, function(field) {
        permit[field] = permit[field].toLowerCase();
      });

      prepped.push(permit);
    });
    return prepped;
  }

  // Set up the map --------------
  // Detroit: 42.42, -83.02
  var map = L.map('map').setView([40.744679,-73.948542], 16);

  var baseLayer = L.tileLayer('http://a.tiles.mapbox.com/v3/matth.map-yyr7jb6r/{z}/{x}/{y}.png');
  map.addLayer(baseLayer);



  cartodb.createLayer(map, 'http://localdata.cartodb.com/api/v2/viz/fce8ff12-7011-11e4-92e6-0e4fddd5de28/viz.json')
    .addTo(map)
    .on('done', function(layer) {
      console.log('done');
    })
    .on('error', function(err) {
      console.log("some error occurred: " + err);
    });

  map.on('click', function(event) {
    var point = "'POINT(" + event.latlng.lng + ' ' + event.latlng.lat + ")'";

    var query = 'SELECT * from ' + TABLE_NAME + ' WHERE ST_Contains(the_geom, ST_SetSRID(ST_GeomFromText(' + point + '), 4326))';
    sql.execute(query)
      .done(function(data) {
        console.log("Got data", data);

        if(data.total_rows === 0) { return; }

        var rows = data.rows;
        var text = JSON.stringify(rows);
        console.log("textifying", text);

        var html = permitsTemplate({
          job_types: JOB_TYPES,
          permit_types: PERMIT_TYPES,
          permit_subtypes: PERMIT_SUBTYPES,
          permits: prepPermits(rows)
        });
        $('#cartodata').html(html);
        //if(rows.length === 0)
      })
      .error(function(error) {
        console.log("Error", error);
      });
  });

  function makeBox(bounds) {
    // box2d ST_MakeBox2D(geometry pointLowLeft, geometry pointUpRight);
    var prefix = 'ST_SetSRID(ST_MakeBox2D(ST_Point(';
    var suffix = ')), 4326)';

    var ne = bounds.getNorthEast();
    var sw = bounds.getSouthWest();
    var query = prefix + sw.lng + ', ' + sw.lat + '), ST_Point(' + ne.lng + ', ' + ne.lat + suffix;

    return query;
    //SELECT * FROM {table_name} WHERE the_geom && ST_SetSRID(ST_MakeBox2D(ST_Point(-73.9980, 40.726), ST_Point(-73.995, 40.723)), 4326)
  }


  function dataTizePermitTypes(data) {
    var labels = [];
    var counts = [];

    _.each(data.rows, function(type) {
      labels.push(type.permit_type);
      counts.push(type.count);
    });

    return {
      labels: labels,
      datasets: [{
        label: "Permit types",
        fillColor: "rgba(220,220,220,0.5)",
        strokeColor: "rgba(220,220,220,0.8)",
        highlightFill: "rgba(220,220,220,0.75)",
        highlightStroke: "rgba(220,220,220,1)",
        data: counts
      }]
    };
  }

  function getTypeStats() {
    // Get stats within the map view
    var bounds = map.getBounds();
    // var query = 'SELECT count(*), max(job_start_date), min(job_start_date) FROM ' + TABLE_NAME +  ' WHERE the_geom && ' + makeBox(bounds);
    var query = 'SELECT permit_type, COUNT(cartodb_id) FROM ' + TABLE_NAME +  " WHERE filing_status = 'INITIAL' AND the_geom && " + makeBox(bounds) + " group by permit_type order by count DESC";

    console.log(query);
    sql.execute(query)
      .done(function(data) {
        console.log("Got data", data.rows);
        $('.permit-types').html(permitTypesTemplate({
          legend: PERMIT_TYPES,
          types: data.rows
        }));

        // Get context with jQuery - using jQuery's .get() method.
        var ctx = $("#chart-permit-types").get(0).getContext("2d");
        var d = dataTizePermitTypes(data);
        var myBarChart = new Chart(ctx).Bar(d, {
          responsive: true
        });

      })
      .error(function(error) {
          console.log("Error", error);
      });
  }



  // Get permit type distribution
  //var types = 'SELECT permit_type, COUNT(cartodb_id) FROM ' + TABLE_NAME +  ' WHERE the_geom && ' + makeBox(bounds) + ' group by permit_type';

  map.on('moveend', getTypeStats);
  getTypeStats();

});
