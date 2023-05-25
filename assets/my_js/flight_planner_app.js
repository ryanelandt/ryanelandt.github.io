import * as THREE from './three.module.min.js';

import Module from './flight_planner.js';

var ModObj;

Module().then((instance) => {
  ModObj = instance;
  console.log("Promise resolved!");
  init();
  // render();
  // animate();
});


let canvas_holder, canvas_helper;
let camera, scene, raycaster, renderer;

let helper_cpp;
let path_rad = 1.5;
let v_cylinders = [];

let rgb_puck_inner = 0xffddbb;  // Yellow 
let rgb_puck_outer = 0x398464;  // Green
let rgb_path       = 0x88722E;  // Brown

// Geometry Control Panel
let puck_size = 3.5;
let puck_height = 0.4;
let puck_dist_lower = 500;
var puck_dist_prop = 1.0001;

const mouse_xy = new THREE.Vector2();

// custom global variables
var vStartEndCity = [];
var vCity = [];
var v_city_puck_inner = [];
var v_city_puck_outer = [];
var dictObIdToCityId = {};


//////////////////////////////////////////


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
  set_canvas_holder_size(canvas_holder, renderer) {
    const width = canvas_holder.clientWidth;
    const height = width / this.aspect_ratio();
    canvas_holder.style.height = height + "px";
    
    renderer.setSize(width, height);
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


// Class stores the id and position of a city
class City {
  constructor(id, position) {
    this.id = id;
    this.position = position;  // Position is a THREE.Vector3
  }

  getId() { return this.id; }
  getPosition() { return this.position; }
}


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
    var fun_name = 'voidAirportXyz';
    puck_dist_lower = 500;
    
    // Call the function in the wasm module
    ModObj.ccall( 
      fun_name,
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
        linear_city_xyz[i]     * puck_dist_lower,
        linear_city_xyz[i + 1] * puck_dist_lower,
        linear_city_xyz[i + 2] * puck_dist_lower
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
}

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

function adjustRaise(obj_in) {
  const xyz = obj_in.position;
  // Assert that xyz is not the zero vector
  if (xyz.x == 0 && xyz.y == 0 && xyz.z == 0) { throw new Error('xyz is the zero vector'); }
  xyz.normalize();
  xyz.multiplyScalar(puck_dist_lower * puck_dist_prop);
  obj_in.position.set(xyz.x, xyz.y, xyz.z);
}

function adjustLower(obj_in) {
  const xyz = obj_in.position;
  // Assert that xyz is not the zero vector
  if (xyz.x == 0 && xyz.y == 0 && xyz.z == 0) { throw new Error('xyz is the zero vector'); }
  xyz.normalize();
  xyz.multiplyScalar(puck_dist_lower);
  obj_in.position.set(xyz.x, xyz.y, xyz.z);
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
}


// Initializes the scene
function init() {
  // Gets the canvas-holder html element
  canvas_holder = document.getElementById("canvas-holder");
  
  canvas_helper = new CanvasHelper();
  camera = canvas_helper.create_camera();
  
  // Define the raycaster
  raycaster = new THREE.Raycaster();
 
  // Define the renderer
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );
  canvas_helper.set_canvas_holder_size(canvas_holder, renderer);
  canvas_holder.appendChild( renderer.domElement );
  
  // Define the scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0xc0c0c0 );
  
  // Add a light
  const light = new THREE.DirectionalLight( 0xffffff, 1 );
  light.position.set( -150, -1050, 800).normalize();
  scene.add( light );

  // Adds the geometry
  initGeometry();

  // Add event listeners
	document.addEventListener( 'mousedown', onDocumentMouseDown, false );
  window.addEventListener( 'resize', onWindowResize );

  render();
}


// Event listener for mouse clicks
function onDocumentMouseDown( event ) {
  // Finds the id of the city clicked
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

  // First city gets raised
  if (vStartEndCity.length == 0) {
    adjustRaise(obj_clicked);
    obj_clicked.material.color.set(rgb_path);
  
  // City in the list gets lowered
  } else if (vStartEndCity.length == 1) {
    const id_lower = vStartEndCity[0];
    const object_lower = scene.getObjectById(id_lower);
    adjustLower(object_lower);
    object_lower.material.color.set(rgb_puck_inner);
  }

  const id_raise = obj_clicked.id;
  manageStartEndCity(id_raise);
  
  drawPath();

  render();
}

// Draws the path between the two clicked cities
function drawPath() {
  if (vStartEndCity.length != 2) { return; }

  var v_id_path = helper_cpp.loadPathReal( 
    dictObIdToCityId[vStartEndCity[0]],
    dictObIdToCityId[vStartEndCity[1]],
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

  // Move the remaining cylinders off the screen
  for (let i = n_cyl_required; i < v_cylinders.length; i++) {
    const cylinder = v_cylinders[i];
    cylinder.position.set(0, 0, -1000);
  }
  
  // Adds a cylinder between each pair of points
  for (let i = 1; i < points.length; i++) {
    const cylinder = v_cylinders[i - 1];
    const xyz_0 = points[i - 1];
    const xyz_1 = points[i];
    adjustCylinder(cylinder, xyz_0, xyz_1);
  }
}

function manageStartEndCity(id) {
  if (vStartEndCity.length <= 1) {
    vStartEndCity.push(id);
    return -1;
  } else {
    // remove the first city from the list 
    const id_remove = vStartEndCity.shift();
    vStartEndCity.push(id);
    return id_remove;
  }
}

function onWindowResize() {
  console.log("CW" + canvas_holder.clientWidth + " CH" + canvas_holder.clientHeight);
  canvas_helper.set_canvas_holder_size(canvas_holder, renderer);
  render();
}

// function animate() {
//   requestAnimationFrame(animate);
//   render();
// }

function render() {
  camera.position.set(-168, -1000, 800)
  camera.lookAt( 0, 0, 0 );
  
  // tilt camera counter clockwise, look from above
  camera.rotation.z = THREE.MathUtils.degToRad( -11 );

  camera.updateMatrixWorld();

  renderer.render( scene, camera );

  console.log("render");
}
