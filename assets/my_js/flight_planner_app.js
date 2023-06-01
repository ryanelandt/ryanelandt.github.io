import * as THREE from './three.module.min.js';

import { CSS2DRenderer, CSS2DObject } from './CSS2DRenderer.js';

import Module from './flight_planner.js';


// The Three.js scene is set up using the city positions from the wasm module.
// The wasm module is loaded asynchronously, so the Three.js scene must be initialized
// after the wasm module is loaded. This is done by wrapping the initialization of the
// Three.js scene in a promise that is resolved when the wasm module is loaded.
Module().then((instance) => {
  ModObj = instance;
  console.log("Promise resolved!");
  init();
});

let ModObj;
let canvas_holder, canvas_helper, helper_cpp;
let camera, scene, raycaster, renderer, labelRenderer;
let markers;
let camera_vectors;

// Colors
const rgb_puck_inner = 0xffddbb;  // Yellow 
const rgb_puck_outer = 0x398464;  // Green
const rgb_path       = 0x88722E;  // Brown

// Geometry Control Panel
const path_rad = 1.6;
const puck_size = 3.5;
const puck_height = 0.4;
const EARTH_RAD = 500;
const puck_dist_prop = 1.0001;

const mouse_xy = new THREE.Vector2();

// Global variables that store stuff
let v_cylinders = [];
let vCity = [];
let v_city_puck_inner = [];
let v_city_puck_outer = [];
let dictObIdToCityId = {};

//////////////////////////////////////////


// Class Allocates a C++ array and frees it when it is destroyed
class CppArrayPointerHelper {
  constructor(n) {
    // Assert the datatype of n_doubles is int
    if (typeof n != 'number') {
      throw new Error('n must be an integer');
    }

    // We need to store n doubles, each double is 8 bytes, so we need to 
    // allocate 8 * n bytes for the data pointer
    this.dataPtr = ModObj._malloc(8 * n);
    
    this.n = n;
    this.lengthPtr = ModObj._malloc(4);  // Allocate 4 bytes for an integer pointer
  }
  
  getLength() { return ModObj.getValue(this.lengthPtr, 'i32'); }  // Returns the length

  free() {
    ModObj._free(this.dataPtr);
    ModObj._free(this.lengthPtr);
  }

  // Loads the Cartesian positions of each city in the planner.
  loadCityData() {
    // Call the function in the wasm module
    ModObj.ccall( 
      'voidAirportXyz',
      'void',
      ['number', 'number'], 
      [this.dataPtr, this.lengthPtr],
    );
      
    // Interprets the Cpp array as a JavaScript array
    var linear_city_xyz = new Float64Array(ModObj.HEAPF64.buffer, this.dataPtr, this.n);
    
    // Create JavaScript array from typed array
    var resultArray = [];
    for (var i = 0; i < this.getLength(); i += 3) {
      resultArray.push([
        linear_city_xyz[i]     * EARTH_RAD,
        linear_city_xyz[i + 1] * EARTH_RAD,
        linear_city_xyz[i + 2] * EARTH_RAD
      ]);
    }
  
    return resultArray;
  }

  // Calculates the sequence of cities that make up the minimum time path from id_src to id_dst.
  loadPathReal(id_src, id_dst) {
    // Call the path planning function in the wasm module
    ModObj.ccall(
      'voidPathOutReal',
      'void',
      ['number', 'number', 'number', 'number'],
      [this.dataPtr, this.lengthPtr, id_src, id_dst],
    );
  
    // Interprets the Cpp array as a JavaScript array
    var linear_path = new Float64Array(ModObj.HEAPF64.buffer, this.dataPtr, this.n);
  
    // Create JavaScript array from typed array
    var resultArray = [];
    for (var i = 0; i < this.getLength(); ++i) {
      var ind_double = linear_path[i];
  
      // Converts to integer -- Asserts is exactly an integer
      var ind = Math.round(ind_double);
      if (ind != ind_double) { throw new Error('ind is not an integer'); }
      resultArray.push(ind);
    }
  
    return resultArray;
  }

  // Gets the name of the city
  get_city_string_for_id(id) {
    // Calls the city name function in the wasm module
    ModObj.ccall(
      'getCityName',
      'void',
      ['number', 'number', 'number'],
      [this.dataPtr, this.lengthPtr, id],
    );
  
    // Interprets the Cpp array as a JavaScript array
    var linear_path = new Float64Array(ModObj.HEAPF64.buffer, this.dataPtr, this.n);
  
    // Create JavaScript string from linear_path
    var string = "";
    for (var i = 0; i < this.getLength(); ++i) {  
      var ind_double = linear_path[i];
      var ind = Math.round(ind_double); 
      if (ind != ind_double) { throw new Error('ind is not an integer'); }

      string += String.fromCharCode(ind);
    }
  
    return string;
  }
}

// Class sizes and resizes the canvas and camera
class CanvasHelper {
  constructor() {
    this.aspect_ratio_ = 1.7;
    this.width_min_ = 400;
    this.frustumSize_ = 215;
  }

  // Creates the camera
  create_camera() {
    const fSize = this.frustumSize();
    return new THREE.OrthographicCamera(
      fSize * this.aspect_ratio_ / - 2,
      fSize * this.aspect_ratio_ / 2,
      fSize / 2,
      fSize / - 2, 1, 1000
    );
  }

  // Sets the size of the canvas and renderer
  set_canvas_holder_size(canvas_holder, renderer, labelRenderer) {
    const width = canvas_holder.clientWidth;
    const height = width / this.aspect_ratio();
    canvas_holder.style.height = height + "px";
    
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);

    this.print_canvas_holder_size(canvas_holder);
  }
  
  // Prints the size of the canvas
  print_canvas_holder_size(ch) { 
    const width = ch.clientWidth;
    const height = ch.clientHeight;
    console.log("width: " + width + " height: " + height);
  }
  
  aspect_ratio() { return this.aspect_ratio_; }
  width_min() { return this.width_min_; }
  frustumSize() { return this.frustumSize_; }
}

// Stores the camera rotation so the components can be reused
class CameraVectors {
  constructor() {
    this.lookAt = new THREE.Vector3(0, 0, 0);

    // x moves right

    // this.uv_z = new THREE.Vector3(-168, -1000, 800).normalize();
    this.uv_z = new THREE.Vector3(-165, -990, 800).normalize();

    const uv_x_des = new THREE.Vector3(1.0, -0.32, 0).normalize();
    this.uv_y = new THREE.Vector3().crossVectors(this.uv_z, uv_x_des).normalize();
    this.uv_x = new THREE.Vector3().crossVectors(this.uv_y, this.uv_z).normalize();

    // Turn uv_x, uv_y, uv_z into a rotation matrix
    this.uv_mat = new THREE.Matrix4();
    this.uv_mat.set(
      this.uv_x.x, this.uv_y.x, this.uv_z.x, 0,
      this.uv_x.y, this.uv_y.y, this.uv_z.y, 0,
      this.uv_x.z, this.uv_y.z, this.uv_z.z, 0,
      0, 0, 0, 1
    );
  }

  getUvIntoViewer() { return this.uv_z.negate(); }
}

// Deals with the markers
class Markers {
  constructor() {
    this.mark_path_last = createMarkerPath();
    this.mark_path_snl = createMarkerPath();
    this.mark_txt_last = createMarkerClear();
    
    // Add to scene
    scene.add(this.mark_path_last);
    scene.add(this.mark_path_snl);
    scene.add(this.mark_txt_last);

    this.vStartEndCity = [];
    this.mark_txt_div = this.createTextDiv();
  }

  // Creates a text div element attached to the document
  createTextDiv() {
    const txtDiv = document.createElement( 'div' );
    txtDiv.className = 'label';
    txtDiv.innerHTML = '';
    txtDiv.style.backgroundColor = 'transparent';
    txtDiv.style.color = 'black';
    txtDiv.style.fontSize = '18px';
    return txtDiv;
  }

  setObjPosition(obj_set, x, y) {
    const uv_x = camera_vectors.uv_x;
    const uv_y = camera_vectors.uv_y;
    const uv_z = camera_vectors.uv_z;

    // Calculates the position of the object
    var v_out = uv_z.clone();
    v_out.add(uv_x.clone().multiplyScalar(x));
    v_out.add(uv_y.clone().multiplyScalar(y));
    v_out.normalize();
    v_out.multiplyScalar(EARTH_RAD * puck_dist_prop);

    // Sets the position of the object
    obj_set.position.set(v_out.x, v_out.y, v_out.z);
  }

  // Records the last two cities that have been clicked
  recordClickedCities(id) {
    if (this.vStartEndCity.length <= 1) {
      this.vStartEndCity.push(id);
      return -1;
    } else {
      // remove the Start city from the list 
      const id_remove = this.vStartEndCity.shift();
      this.vStartEndCity.push(id);
      return id_remove;
    }
  }

  updateMarkers(id_click) {
    this.recordClickedCities(id_click);

    const id_last = this.getCityIdLast();
    this.setObjPositionToCity(id_last, this.mark_path_last);
    this.setObjPosition(this.mark_txt_last, -0.393, -0.2105);
    this.setDivTextToCityName();

    const id_snl = this.getCityIdSnl();
    if (id_snl != null) {
      this.setObjPositionToCity(id_snl, this.mark_path_snl);
    }
  }

  getCityIdLast() {
    if (this.vStartEndCity.length == 0) { return null; }
    const id = this.vStartEndCity[this.vStartEndCity.length - 1];
    return dictObIdToCityId[id];
  }

  // Gets the second to last city id
  getCityIdSnl() {
    if (this.vStartEndCity.length == 1) { return null; }
    const id = this.vStartEndCity[this.vStartEndCity.length - 2];
    return dictObIdToCityId[id];
  }

  setObjPositionToCity(id_city, obj) {
    const xyz = vCity[id_city].getPosition();
    var xyz_scale = xyz.clone().multiplyScalar(1.01);
    obj.position.set(xyz_scale.x, xyz_scale.y, xyz_scale.z);
  }

  initText() { this.attachTextToObject(this.mark_txt_last, this.mark_txt_div); }

  setDivTextToCityName() {
    const id = this.getCityIdLast();
    const string = helper_cpp.get_city_string_for_id(id);
    this.mark_txt_div.innerHTML = string;
  }

  attachTextToObject(attach_to, txtDiv) {
    attach_to.layers.enableAll();
    
    const txt_label = new CSS2DObject( txtDiv );
    
    // Sets label position 10 units to the right of the marker
    const DDD = 9;
    txt_label.position.set( DDD, 0, 0 );

    txt_label.center.set( 0, 0.5 );
    attach_to.add( txt_label );
    txt_label.layers.set( 0 );
  }
}

// Class stores the id and position of a city
class City {
  constructor(id, position) {
    this.id = id;
    this.position = position;  // Position is a THREE.Vector3
  }

  getId() { return this.id; }
  getPosition() { return this.position; }
}

function create_circle_black() {
  var obj_geometry = new THREE.CircleGeometry( puck_size * 1.0, 32 );
  var obj_material = new THREE.MeshBasicMaterial( { color: 0x000000 } );
  return new THREE.Mesh(obj_geometry, obj_material);
}

function create_circle_transparent() {
  var obj_geometry = new THREE.CircleGeometry( puck_size * 1.0, 32 );
  var obj_material = new THREE.MeshBasicMaterial( { color: 0x000000, transparent: true, opacity: 0.0 } );
  return new THREE.Mesh(obj_geometry, obj_material);
}

function createMarker(marker_obj) {
  marker_obj.position.set(0, 0, -1000);
  marker_obj.rotation.setFromRotationMatrix(camera_vectors.uv_mat);
  return marker_obj;
}

function createMarkerClear() { return createMarker(create_circle_transparent()); }
function createMarkerPath() { return createMarker(create_circle_black()); }

function createCylGeoForHeight(r, h) { return new THREE.CylinderGeometry(r, r, h, 16, 1, false); }
function createNewCylinder(r) {
  const geometry = createCylGeoForHeight(r, 1);
  
  // Create the material
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green color for the cylinder

  // Create the mesh and position it
  const cylinder = new THREE.Mesh(geometry, material); 
  scene.add(cylinder);
  return cylinder;
}

function adjustCylinder(cylinder, xyz_0, xyz_1, is_reuse_height=false) {
  // Same as the 3 lines above, but on 1 line
  const [x0, y0, z0] = xyz_0;
  const [x1, y1, z1] = xyz_1;

  var height = 100;
  if (is_reuse_height) {
    height = cylinder.geometry.parameters.height; // Height of the cylinder
  } else {
    height = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2); // Height of the cylinder
  }

  // Sets the height of the cylinder
  const c_rad = cylinder.geometry.parameters.radiusTop;
  cylinder.geometry.dispose();
  cylinder.geometry = createCylGeoForHeight(c_rad, height);

  // Set the position of the cylinder to the midpoint of the two points
  cylinder.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  // Set the direction of the cylinder
  const direction = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
}

// Initializes the geometry of the scene
function initGeometry() {
  const n_doubles_allocate = 303 * 3;
  helper_cpp = new CppArrayPointerHelper(n_doubles_allocate);
  var resultArray = helper_cpp.loadCityData();

  // Add cities to vCity
  for (let i = 0; i < resultArray.length; i++) {
    const city = new City(i, new THREE.Vector3(resultArray[i][0], resultArray[i][1], resultArray[i][2]));
    vCity.push(city);
  }

  const puck_inner = createCylGeoForHeight(puck_size, puck_height);
  
  var outlineGeometry = createCylGeoForHeight(puck_size * 2.0, puck_height * 0.5);
  var outlineMaterial = new THREE.MeshBasicMaterial( { color: rgb_puck_outer, side: THREE.BackSide } );
  
  markers = new Markers();

  // Iterate over vCity
  for (let i = 0; i < vCity.length; i++) {
    const object = new THREE.Mesh( puck_inner,
      new THREE.MeshBasicMaterial( {
        color: rgb_puck_inner,
      } )
    );
    
    const position_i = vCity[i].getPosition();

    object.material.depthTest = true;
    adjustCylinder(object, [0, 0, 0], position_i, true);
    
    var outlineMesh = new THREE.Mesh( outlineGeometry, outlineMaterial );
    adjustCylinder(outlineMesh, [0, 0, 0], position_i, true);
    
    object.position.set( vCity[i].getPosition().x, vCity[i].getPosition().y, vCity[i].getPosition().z );
    outlineMesh.position.set( vCity[i].getPosition().x, vCity[i].getPosition().y, vCity[i].getPosition().z );

    var group = new THREE.Group();
    group.add( object );
    group.add( outlineMesh );
    scene.add( group );
    
    v_city_puck_inner.push(object);
    v_city_puck_outer.push(outlineMesh);
    dictObIdToCityId[object.id] = i;
    dictObIdToCityId[outlineMesh.id] = i;
  }

  markers.initText();
}

// Initializes the scene
function init() {
  // Gets the canvas-holder html element
  canvas_holder = document.getElementById("canvas-holder");
  camera_vectors = new CameraVectors();
  
  canvas_helper = new CanvasHelper();
  camera = canvas_helper.create_camera();
  
  // Define the raycaster
  raycaster = new THREE.Raycaster();
 
  // Define the renderer
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );

  labelRenderer = new CSS2DRenderer();
  // labelRenderer.setSize( window.innerWidth, window.innerHeight );
  labelRenderer.domElement.style.position = 'absolute';
  // labelRenderer.domElement.style.top = '0px';
  canvas_holder.appendChild( labelRenderer.domElement );

  canvas_helper.set_canvas_holder_size(canvas_holder, renderer, labelRenderer);
  canvas_holder.appendChild( renderer.domElement );
  
  // Define the scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0xc0c0c0 );
  
  // Add a light
  const light = new THREE.DirectionalLight( 0xffffff, 1 );
  light.position.set( -150, -1050, 800).normalize();
  scene.add( light );

  initGeometry();  // Adds the geometry

  // Add event listeners
	document.addEventListener( 'mousedown', onDocumentMouseDown, false );
  window.addEventListener( 'resize', onWindowResize );

  render();
}

// Event listener for mouse clicks
function onDocumentMouseDown( event ) {
  function findIdCityClicked(raycaster) {
    // Find intersections with inner pucks
    const intersects = raycaster.intersectObjects( v_city_puck_inner, true );
    if (intersects.length != 0) {
      return dictObIdToCityId[intersects[0].object.id];
    }

    // Find intersections with outer pucks
    const intersects_outer = raycaster.intersectObjects( v_city_puck_outer, true );
    if (intersects_outer.length != 0) { 
      const obj_outer = intersects_outer[0];
      return dictObIdToCityId[obj_outer.object.id];
    }
    
    return null;
  }

  // update the mouse variable
  const rect = renderer.domElement.getBoundingClientRect();
  mouse_xy.x = ( ( event.clientX - rect.left ) / ( rect.right - rect.left ) ) * 2 - 1;
  mouse_xy.y = - ( ( event.clientY - rect.top ) / ( rect.bottom - rect.top) ) * 2 + 1;
  raycaster.setFromCamera( mouse_xy, camera );
  const id_city_clicked = findIdCityClicked(raycaster);
  if (id_city_clicked == null) { return; }

  var obj_clicked = v_city_puck_inner[id_city_clicked];

  const id_raise = obj_clicked.id;
  
  markers.updateMarkers(id_raise);
  drawPath();
  render();
}


// Draws the path between the two clicked cities
function drawPath() {
  if (markers.vStartEndCity.length != 2) { return; }

  var v_id_path = helper_cpp.loadPathReal( 
    dictObIdToCityId[markers.vStartEndCity[0]],
    dictObIdToCityId[markers.vStartEndCity[1]],
  );

  // Log to console
  console.log("Printing v_id_path" + v_id_path);
  
  // Gets the xyz positions of the cities in v_id_path
  const points = [];
  for (let i = 0; i < v_id_path.length; i++) {
    var id = v_id_path[i];
    var pos = vCity[id].getPosition();

    // If pos is different from pos_prev, add it to points
    if (i == 0 || !pos.equals(points[points.length - 1])) {
      points.push(pos);
    }
  }

  const n_cyl_required = points.length - 1;

  // Add cylinders if the number of points is greater than the number of cylinders
  for (let i = v_cylinders.length; i < n_cyl_required; i++) {
    const cylinder = createNewCylinder(path_rad);
    cylinder.material.color.set(rgb_path);
    v_cylinders.push(cylinder);
  }

  // Move all cylinders off the screen
  for (let i = 0; i < v_cylinders.length; i++) {
    const cylinder = v_cylinders[i];
    cylinder.position.set(0, 0, -1000);
  }

  // id city last clicked
  const id_last = markers.getCityIdLast();

  // Adds a cylinder between each pair of points
  for (let i = 1; i < points.length; i++) {
    const cylinder = v_cylinders[i - 1];
    const xyz_0 = points[i - 1];
    const xyz_1 = points[i];

    setTimeout(() => {
      if (id_last != markers.getCityIdLast()) { return; }
      adjustCylinder(cylinder, xyz_0, xyz_1);
      render();
    }, i * 70);
  }
}

function onWindowResize() {
  console.log("CW" + canvas_holder.clientWidth + " CH" + canvas_holder.clientHeight);
  canvas_helper.set_canvas_holder_size(canvas_holder, renderer, labelRenderer);
  render();
}

function render() {
  camera.position.set(-168, -1000, 800)
  camera.lookAt( 0, 0, 0 );
  camera.rotation.setFromRotationMatrix(camera_vectors.uv_mat);

  camera.updateMatrixWorld(); 
  
  renderer.render( scene, camera );
  labelRenderer.render( scene, camera );

  console.log("render");
}
