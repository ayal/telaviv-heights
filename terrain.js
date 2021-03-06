//noprotect 

var nwest = new google.maps.LatLng(32.097765, 34.743147)
var mapOptions = {
    zoom: 25,
    center: nwest,
    mapTypeId: 'terrain'
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


var container, stats;

var camera, controls, scene, renderer;

var mesh, texture;

var worldWidth = 256,
  worldDepth = 256,
  worldHalfWidth = worldWidth / 2,
  worldHalfDepth = worldDepth / 2;

var clock = new THREE.Clock();

zeropoint = {x: -3750, z: -3750, y: 1000}

function init() {

  container = document.getElementById('container');

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);

  scene = new THREE.Scene();

  
 controls = new THREE.FirstPersonControls(camera);
  controls.movementSpeed = 500;
  controls.lookSpeed = 0.1;

  data = generateHeight(worldWidth, worldDepth);


    camera.position.y = zeropoint.y;
    camera.position.x = zeropoint.x;
    camera.position.z = zeropoint.z;

  
    var geometry = new THREE.PlaneBufferGeometry(7500, 7500, worldWidth - 1, worldDepth - 1);
    geometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

    var vertices = geometry.attributes.position.array;

    for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {

      vertices[j + 1] = data[i] * 10;

    }

    texture = new THREE.Texture(generateTexture(data, worldWidth, worldDepth), THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
   
    texture.needsUpdate = true;

    mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: texture
    }));
    scene.add(mesh);

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
if (!bigdata[j] || bigdata[j] <= 0.1) {
    imageData[i] = 0;
  imageData[i + 1] = 0;
 
    imageData[i + 2] = 100; 
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

  	for ( var i = 0, l = imageData.length; i < l; i += 4 ) {

					var v = ~~ ( Math.random() * 5 );

					imageData[ i ] += v;
					imageData[ i + 1 ] += v;
					imageData[ i + 2 ] += v;

				}

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
  mapdomainx = 34.798637 - 34.743147;
  mapdomainy = 32.097765 - (32.097765 - 255 * 0.00035)
  newmapx = 34.743147 + (deltax / 7500) * mapdomainx;
   newmapy = 32.097765 - (deltay / 7500) * mapdomainy;
  if (prevmapx !== newmapx && prevmapy !== newmapy) {
    prevmapx = newmapx;
    prevmapy = newmapy;
console.log('setting map center', newmapx, newmapy);
    var newlatlng = new google.maps.LatLng(newmapy, newmapx)
    map.panTo(newlatlng);
    
        marker.setPosition(newlatlng);


  }
     marker.setIcon({
    path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale:3,
    rotation: camera.rotation.z * 180 / Math.PI * -1
  })
   
}

function render() {

  controls.update(clock.getDelta());
  renderer.render(scene, camera);

}

init();
animate();
