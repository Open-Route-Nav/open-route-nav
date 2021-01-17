import axios from 'axios';
import mapboxgl from 'mapbox-gl';
const turf = require('@turf/turf');
import geojsonExtent from '@mapbox/geojson-extent';
import positionMarkerDrawing from './position-marker-drawing.js';

class OpenRouteNav {
  constructor(mapboxToken, containerId, options={}) {
    // Mapbox setup
    mapboxgl.accessToken = mapboxToken;
    this.map = new mapboxgl.Map({
      container: containerId,
      style: options.mapStyle ? options.mapStyle : 'mapbox://styles/mapbox/navigation-guidance-day-v2?optimize=true',
    });

    // Infobox setup
    var infoBoxContainer = document.createElement('div');
    infoBoxContainer.id = "orn-info-box-container";
    document.getElementById(containerId).appendChild(infoBoxContainer);
    this.infoBoxElements = {
      parent: document.createElement('div'),
      destination: document.createElement('div'),
      infoRow: document.createElement('div'),
      distance: document.createElement('div'),
      time: document.createElement('div'),
      speed: document.createElement('div'),
    };

    this.infoBoxElements.parent.id = "orn-info-box";
    infoBoxContainer.appendChild(this.infoBoxElements.parent);

    this.infoBoxElements.destination.id = "orn-info-box-destination";
    this.infoBoxElements.parent.appendChild(this.infoBoxElements.destination);

    this.infoBoxElements.infoRow.id = "orn-info-box-info-row";
    this.infoBoxElements.parent.appendChild(this.infoBoxElements.infoRow);

    this.infoBoxElements.distance.id = "orn-info-box-distance";
    this.infoBoxElements.infoRow.appendChild(this.infoBoxElements.distance);

    this.infoBoxElements.time.id = "orn-info-box-time";
    this.infoBoxElements.infoRow.appendChild(this.infoBoxElements.time);

    this.infoBoxElements.speed.id = "orn-info-box-speed";
    this.infoBoxElements.infoRow.appendChild(this.infoBoxElements.speed);

    // Options setup
    this.containerId = containerId;
    this.options = options;
    if (!this.options.target) {
      this.options.target = null;
    }
    if (!this.options.profile) {
      this.options.profile = "driving-traffic";
    }
    if (!this.options.zoom) {
      this.options.zoom = 10;
    }
    if (!this.options.pitch) {
      this.options.pitch = 0;
    }
    if (!this.options.position) {
      this.options.position = {
        bearing: 0,
        location: {lat: 0, lng: 0}
      }
    }
    if (this.options.location) {
      this.options.position.location = {...this.options.location};
      delete this.options.location;
      this.map.on('load', this._drawPositionMarker.bind(this));
    }

    // Variables setup
    this.state = "idle";
    this.currentStep = 0;
  }

  onLoad(func) {
    this.map.on('load', func);
  }

  onSpeak(func) {
    this.onSpeakFunction = func;
  }

  _updateSteps() {
    var stepStats = []
    for (let stepNo = this.currentStep; stepNo < this.route.legs[0].steps.length && stepNo < this.currentStep + 10; stepNo++) {
      const step = this.route.legs[0].steps[stepNo];

      const stepStart = step.geometry.coordinates[0];
      const stepEnd = step.geometry.coordinates[step.geometry.coordinates.length - 1];
      const myLocation = [this.options.position.location.lng, this.options.position.location.lat];

      const c = turf.distance(stepStart, stepEnd, {}) * 1000; // Distance between start and end of step
      const a = turf.distance(stepStart, myLocation, {}) * 1000; // Distance from start to current position
      const b = turf.distance(stepEnd, myLocation, {}) * 1000; // Distance from end to current position
      
      const x = (Math.pow(a, 2) - Math.pow(b, 2) + Math.pow(c, 2)) / (2*c); // Distance along road
      const d = Math.sqrt(Math.pow(a, 2) - Math.pow(x, 2)); // Distance away from road

      stepStats.push({
        stepNo,
        stepDistance: step.distance,
        distanceAlong: x,
        distanceFromEnd: step.distance - x,
        distanceTo: d
      });
    }
    var currentStep = stepStats.reduce(function(a, b) {
      if (a.distanceTo < b.distanceTo) {
        return a;
      } else {
        return b;
      }
    });

    const graceDistance = 15;

    if (currentStep.distanceTo > graceDistance || currentStep.distanceAlong < -graceDistance) {
      this.state = "calculating";
      this._requestRoute(false).then(() => {
        this.state = "navigating";
      });
    } else {
      this.currentStep = currentStep.stepNo;
      var step = this.route.legs[0].steps[currentStep.stepNo];

      step.voiceInstructions.forEach(instruction => {
        if (instruction.distanceAlongGeometry > currentStep.distanceFromEnd && !instruction.used) {
          if (this.onSpeakFunction) {
            this.onSpeakFunction(instruction.announcement);
          }
          instruction.used = true;
        }
      });
    }

  }

  _mapboxRequest(endpoint, params) {
    params['access_token'] = mapboxgl.accessToken;
    var paramString = "?";
    for (const key in params) {
        if (paramString != "?") {
            paramString += "&";
        }
        paramString += key + "=" + encodeURIComponent(params[key]);
    }
    return axios.get(`https://api.mapbox.com/${endpoint}${paramString}`);
  }

  _displayRoute(route, zoomOut) {
    const geoJson = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates,
      }
    }

    if (this.map.getSource('route-1')) {
      this.map.getSource('route-1').setData(geoJson);
      this.map.getSource('route-2').setData(geoJson);
    } else {
      this.map.addLayer({
        id: 'route-1',
        type: 'line',
        source: {
          type: 'geojson',
          data: geoJson
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#349beb',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 19, 20],
        }
      }, 'road-label-small');
      this.map.addLayer({
        id: 'route-2',
        type: 'line',
        source: {
          type: 'geojson',
          data: geoJson
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2770a8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 19, 35],
        }
      }, 'route-1');
    }

    if (zoomOut) {
      // Zoom to the bounds of the route
      const xPadding = document.getElementById(this.containerId).offsetWidth * 0.1;
      const yPadding = document.getElementById(this.containerId).offsetHeight * 0.1;
      this.map.fitBounds(geojsonExtent(geoJson), {padding: {
        top: yPadding,
        bottom: yPadding,
        left: xPadding,
        right: xPadding
      }});
    }

  }

  _populateInfoBox(data) {
    const route = data.routes[0];

    this.infoBoxElements.destination.innerHTML = `<div id="orn-info-box-destination-start">${data.waypoints[0].name}</div> to <div id="orn-info-box-destination-end">${data.waypoints[1].name}</div>`;
    
    const distance = (route.distance / 1000).toFixed(1);
    this.infoBoxElements.distance.innerHTML = `${distance} km`;
    
    const hours = Math.floor(route.duration / (60 * 60));
    const minutes = Math.floor((route.duration - (hours * 60 * 60)) / 60);
    this.infoBoxElements.time.innerHTML = `${hours}:${minutes}`;

    this.infoBoxElements.speed.innerHTML = `<div class="orn-road-sign">30</div>`;
  }

  _requestRoute(zoomOut) {
    this.state = "calculating";
    const targetString = `${this.options.position.location.lng},${this.options.position.location.lat};${this.options.target.lng},${this.options.target.lat}`;
    return this._mapboxRequest(
      `directions/v5/mapbox/${this.options.profile}/${targetString}`,
      {
        geometries: "geojson",
        overview: "full",
        steps: true,
        banner_instructions: true,
        voice_instructions: true,
        ...(this.options.position.bearing ? {
          bearings: `${this.options.position.bearing},45;`,
        } : {})
      }
    ).then(response => {
      this._displayRoute(response.data.routes[0], zoomOut);
      this._populateInfoBox(response.data);
      this.route = response.data.routes[0];
      this._updateSteps();
    });
  }

  _drawPositionMarker() {

    if (!this.positionMarkerCanvas) {
      this.positionMarkerCanvas = document.createElement('canvas');
      this.positionMarkerCanvas.id = 'orn-position-marker';
      this.positionMarkerCanvas.width = 100;
      this.positionMarkerCanvas.height = 100;
      document.getElementById(this.containerId).appendChild(this.positionMarkerCanvas);
    }

    var ctx = this.positionMarkerCanvas.getContext("2d");
    positionMarkerDrawing.drawMarker(ctx, 360 - (this.options.position.bearing || 0));

    const loc = this.options.position.location;
    const coords = [
      [loc.lng - 0.00006, loc.lat - 0.00003],
      [loc.lng + 0.00006, loc.lat - 0.00003],
      [loc.lng + 0.00006, loc.lat + 0.00003],
      [loc.lng - 0.00006, loc.lat + 0.00003],
    ];

    if (this.map.getSource('position-marker')) {
      this.map.getSource('position-marker').setCoordinates(coords);
    } else { 
      this.map.addSource('position-marker', {
        type: 'canvas',
        canvas: 'orn-position-marker',
        animate: true,
        coordinates: coords,
      });
      this.map.addLayer({
        id: 'canvas-layer',
        type: 'raster',
        source: 'position-marker'
      });
    }

  } 

  startNavigation() {
    this.state = "navigating";
    this.options.zoom = 19;
    this.options.pitch = 70;
    this.map.flyTo({
      center: this.options.position.location, 
      bearing: this.options.position.bearing, 
      zoom: this.options.zoom,
      pitch: this.options.pitch,
    });
  }

  set position(position) {
    this.options.position.location = position.location || this.options.position.location;
    this.options.position.bearing = position.bearing || this.options.position.bearing;
    if (this.state == "navigating" || this.state == "calculating") {
      this.map.flyTo({
        center: this.options.position.location, 
        bearing: this.options.position.bearing, 
        zoom: this.options.zoom,
        pitch: this.options.pitch,
      });
      if (this.state == "navigating") {
        this._updateSteps();
      }
    }
    this._drawPositionMarker();
  }

  get position() {
    return this.options.position;
  }

  set target(target) {
    this.options.target = target;
    this.state = "calculating";
    this._requestRoute(true).then(() => {
      this.state = "viewRoute";
    });
  }
  get target() {
    return this.options.target;
  }

  set profile(profile) {
    this.options.profile = profile;
  }
  get profile() {
    return this.options.profile;
  }

}

export { OpenRouteNav };