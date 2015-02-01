//noprotect 

var nwest = new google.maps.LatLng(32.097765, 34.743147)
    var mapOptions = {
    zoom: 17,
    center: nwest
}
    map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);




var marker = new google.maps.Marker({
	position: nwest,
	icon: {
	    path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
	    scale:2,
	    rotation:0
	
	},

	map: map,
	title: 'Hello World!'
    });

if (!Detector.webgl) {

    Detector.addGetWebGLMessage();
    document.getElementById('container').innerHTML = "";

}

$.yooshpost = function (cb) {

    var data =  {
	"SearchFilters": {
         "location": {
          "$type": "Yoosh.SharedClasses.YooshLocation, YooshSharedClassesDll",
          "Latitude": "32.097765",
          "Longitude": "34.743147"
        },
        "time": "2015-02-02T00:38:14+02:00"
      }
    };

  var args = {
    "APIKey": "1.0.0___3659E990-DDBB-42F6-B9DA-5E39B301FE74",
    "DeviceType": 2,
    "DeviceId": null,
    "RequestingUserId": "00000000-0000-0000-0000-000000000001"
  };
  args = _.extend(args, data);

  return $.ajax({
    url: 'http://api.yoosh.io:8000/yoosh/yooshfeservice/json2/getEventsGTFast',
    type: 'post',
    data: JSON.stringify(args),
    headers: {
	      /*      Authorization: session, */
      "Content-Type": "application/json"
    },
    success: function (data) {
      cb(data);
    },
    error: function (error, ajaxOptions, thrownError) {
      console.log("AJAX Error!", thrownError);
    }
  });
};


var container, stats;

var camera, controls, scene, renderer;

var mesh, texture;

var worldWidth = 256,
    worldDepth = 256,
    worldHalfWidth = worldWidth / 2,
    worldHalfDepth = worldDepth / 2;

var clock = new THREE.Clock();

zeropoint = {x: -10000, z: -10000, y: 1000}

    function init() {

	container = document.getElementById('container');

	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);

	scene = new THREE.Scene();

	controls = new THREE.FirstPersonControls(camera);
	controls.movementSpeed = 800;
	controls.lookSpeed = 0.1;

	data = generateHeight(worldWidth, worldDepth);

	camera.position.y = zeropoint.y;
	camera.position.x = zeropoint.x;
	camera.position.z = zeropoint.z;
	camera.lookAt(new THREE.Vector3(0,0,0));
    
	var geometry = new THREE.PlaneBufferGeometry(20000, 20000, worldWidth - 1, worldDepth - 1);
	geometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

	var vertices = geometry.attributes.position.array;

	for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {

	    vertices[j + 1] = data[i] * 18;

	}

	texture = new THREE.Texture(generateTexture(data, worldWidth, worldDepth), THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
    
	texture.needsUpdate = true;

	mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
		    map: texture
		}));
	scene.add(mesh);
	objects = [];
	var geometry1 = new THREE.CubeGeometry( 200, 200, 200 );	
	var material1 = new THREE.MeshBasicMaterial( { color: 0xaa0000 } );
	var mesh1 = new THREE.Mesh( geometry1, material1 );
	mesh1.position.x = -1500
	mesh1.position.z = 2500;
	mesh1.position.y = 2000;
	objects.push(mesh1);

	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();

	document.addEventListener( 'mousedown', onDocumentMouseDown, false );

	function onDocumentMouseDown( event ) {
	    event.preventDefault();
	    mouse.x = ( event.clientX / renderer.domElement.width ) * 2 - 1;
	    mouse.y = - ( event.clientY / renderer.domElement.height ) * 2 + 1;
	    raycaster.setFromCamera( mouse, camera );
	    var intersects = raycaster.intersectObjects( objects );
	    if ( intersects.length > 0 ) {
		intersects[ 0 ].object.material.color.setHex( Math.random() * 0xffffff );
		window.open('http://www.google.com');
	    }
	}

	//scene is global
	scene.add(mesh1);

	renderer = new THREE.WebGLRenderer();
	renderer.setClearColor(0xbfd1e5);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);

	container.innerHTML = "";

	container.appendChild(renderer.domElement);

	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	container.appendChild(stats.domElement);

	//

	window.addEventListener('resize', onWindowResize, false);
    
    }

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    controls.handleResize();

}

function generateHeight(width, height) {

    var size = width * height,
	data = new Uint8Array(size),
	perlin = new ImprovedNoise(),
	quality = 1,
	z = Math.random() * 100;

    var t = 0;
    var d = 1;
    var v = 0;
    for (var j = 0; j < 4; j++) {

	for (var i = 0; i < size; i++) {

	    //var x = i % width, y = ~~ ( i / width );
	    //data[ i ] += Math.abs( perlin.noise( x / quality, y / quality, z ) * quality * 1.75 );
	    data[i] = bigdata[i] > 0 ? bigdata[i] :  0;
	}

	quality *= 5;

    }

    return data;

}

function generateTexture(data, width, height) {

    var canvas, canvasScaled, context, image, imageData,
	level, diff, vector3, sun, shade;

    vector3 = new THREE.Vector3(0, 0, 0);

    sun = new THREE.Vector3(1, 1, 1);
    sun.normalize();

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    context = canvas.getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    image = context.getImageData(0, 0, canvas.width, canvas.height);
    imageData = image.data;

    for (var i = 0, j = 0, l = imageData.length; i < l; i += 4, j++) {

	vector3.x = data[j - 2] - data[j + 2];
	vector3.y = 2;
	vector3.z = data[j - width * 2] - data[j + width * 2];
	vector3.normalize();


	shade = vector3.dot(sun);
	if (!bigdata[j] || bigdata[j] <= 3) {
	    imageData[i] = 0;
	    imageData[i + 1] = 0;
	    
	    imageData[i + 2] = 100; 
	}
	else if (!bigdata[j] || bigdata[j] > 33) {
	    imageData[i] = (46 + shade * 128) * (0.5 + data[j] * 0.007);
	    imageData[i + 1] = (46 + shade * 128) * (0.5 + data[j] * 0.007);
	    imageData[i + 2] = 0;	    
	}
	else {
	    imageData[i] = (46 + shade * 128) * (0.5 + data[j] * 0.007);
	    imageData[i + 1] = (82 + shade * 96) * (0.5 + data[j] * 0.007);
	    imageData[i + 2] = (shade * 96) * (0.5 + data[j] * 0.007);	    
	}
	
    }

    context.putImageData(image, 0, 0);

    // Scaled 4x

    canvasScaled = document.createElement('canvas');
    canvasScaled.width = width * 4;
    canvasScaled.height = height * 4;

    context = canvasScaled.getContext('2d');
    context.scale(4, 4);
    context.drawImage(canvas, 0, 0);
    context.drawImage(canvas,0,0);
    image = context.getImageData(0, 0, canvasScaled.width, canvasScaled.height);
    imageData = image.data;

    /*    for ( var i = 0, l = imageData.length; i < l; i += 4 ) {

	  var v = ~~ ( Math.random() * 5 );

	  imageData[ i ] += v;
	  imageData[ i + 1 ] += v;
	  imageData[ i + 2 ] += v;

	  }*/

    context.putImageData(image, 0, 0);
    

    return canvasScaled;

}

//

prevmapx = 0;
prevmapy = 0;


function animate() {

    requestAnimationFrame(animate);

    render();
    stats.update();
    deltax = camera.position.x - zeropoint.x;
    deltay = camera.position.z - zeropoint.z;
    mapdomainx = 34.828637 - 34.743147;
    mapdomainy = 32.120765 - (32.120765 - 255 * 0.0003339453125)
	newmapx = 34.743147 + (deltax / 20000) * mapdomainx;
    newmapy = 32.120765 - (deltay / 20000) * mapdomainy;
    if (prevmapx !== newmapx && prevmapy !== newmapy) {
	prevmapx = newmapx;
	prevmapy = newmapy;
	console.log('setting map center', newmapx, newmapy);
	var newlatlng = new google.maps.LatLng(newmapy, newmapx)
	    map.panTo(newlatlng);
	
        marker.setPosition(newlatlng);


    }

    var pLocal = new THREE.Vector3( 0, 0, -1 );
    var pWorld = pLocal.applyMatrix4( camera.matrixWorld );
    var dir = pWorld.sub( camera.position ).normalize();
    

    marker.setIcon({
	    path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
		scale:3,
		rotation: Math.atan2(dir.z, dir.x) * 180 / Math.PI + 90
		})  
	}

function render() {

    controls.update(clock.getDelta());
    renderer.render(scene, camera);

}

init();
animate();
