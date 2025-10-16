import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Upload, RotateCcw, Maximize2, Info, Download, Filter, BarChart3, Sparkles, TrendingUp, Grid, Share2, FileJson, X } from 'lucide-react';

const DataVisualizer3D = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const animationIdRef = useRef(null);
  const fileInputRef = useRef(null);

  const [isRotating, setIsRotating] = useState(true);
  const [dataMode, setDataMode] = useState('wave');
  const [vizMode, setVizMode] = useState('surface');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [uploadedData, setUploadedData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({ x: '', y: '', z: '' });
  const [availableColumns, setAvailableColumns] = useState([]);
  const [showMapping, setShowMapping] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [filterRange, setFilterRange] = useState({ min: -Infinity, max: Infinity });
  const [searchValue, setSearchValue] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentData, setCurrentData] = useState([]);

  const mouseRef = useRef({ x: 0, y: 0 });
  const raycasterRef = useRef(new THREE.Raycaster());

  // --- Helper Functions ---
  const generateData = (mode) => {
    const size = 50;
    const data = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const x = (i - size / 2) / 5;
        const z = (j - size / 2) / 5;
        let y = 0;
        switch (mode) {
          case 'wave':
            y = Math.sin(x) * Math.cos(z) * 2;
            break;
          case 'peaks':
            y = Math.exp(-(x * x + z * z) / 10) * 5;
            break;
          case 'terrain':
            y = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 3 + Math.sin(x * 2) * 0.5 + Math.cos(z * 2) * 0.5;
            break;
          case 'random':
            y = Math.random() * 3 - 1.5;
            break;
          default:
            y = 0;
        }
        data.push({ x: i, y, z: j, value: y });
      }
    }
    return data;
  };

  const calculateStatistics = (data) => {
    if (!data || data.length === 0) return null;
    const values = data.map((d) => d.value);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const outliers = data.filter((d) => Math.abs(d.value - mean) > 2 * stdDev);
    return { mean, median, min, max, stdDev, outliers: outliers.length, total: values.length };
  };

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((header, index) => {
        const value = values[index]?.trim();
        row[header] = isNaN(value) ? value : parseFloat(value);
      });
      data.push(row);
    }
    return { headers, data };
  };

  // --- Event Handlers ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      if (file.name.endsWith('.json')) {
        const jsonData = JSON.parse(content);
        const headers = Object.keys(jsonData[0] || {});
        setAvailableColumns(headers);
        setUploadedData(jsonData);
        setShowMapping(true);
      } else if (file.name.endsWith('.csv')) {
        const { headers, data } = parseCSV(content);
        setAvailableColumns(headers);
        setUploadedData(data);
        setShowMapping(true);
      }
    };
    reader.readAsText(file);
  };

  const applyMapping = () => {
    if (!uploadedData || !columnMapping.x || !columnMapping.y || !columnMapping.z) {
      alert('Please select all three columns (X, Y, Z)');
      return;
    }
    const mappedData = uploadedData.map((row, idx) => ({
      x: parseFloat(row[columnMapping.x]) || idx,
      y: parseFloat(row[columnMapping.y]) || 0,
      z: parseFloat(row[columnMapping.z]) || idx,
      value: parseFloat(row[columnMapping.y]) || 0,
      originalData: row,
    }));
    setCurrentData(mappedData);
    setDataMode('uploaded');
    setShowMapping(false);
    const stats = calculateStatistics(mappedData);
    setStatistics(stats);
  };

  const getFilteredData = () => {
    let data = dataMode === 'uploaded' ? currentData : generateData(dataMode);
    if (filterRange.min !== -Infinity || filterRange.max !== Infinity) {
      data = data.filter((d) => d.value >= filterRange.min && d.value <= filterRange.max);
    }
    if (searchValue) {
      const searchNum = parseFloat(searchValue);
      if (!isNaN(searchNum)) {
        data = data.filter((d) => Math.abs(d.value - searchNum) < 0.5);
      }
    }
    return data;
  };

  const exportAsPNG = () => {
    if (!rendererRef.current) return;
    const link = document.createElement('a');
    link.download = '3d-visualization.png';
    link.href = rendererRef.current.domElement.toDataURL();
    link.click();
  };

  const shareAsURL = () => {
    const state = {
      dataMode,
      vizMode,
      isRotating,
      filterRange,
      camera: {
        x: cameraRef.current.position.x,
        y: cameraRef.current.position.y,
        z: cameraRef.current.position.z,
      },
    };
    const encoded = btoa(JSON.stringify(state));
    const url = `${window.location.origin}${window.location.pathname}?state=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Share URL copied to clipboard!');
    });
  };

  const exportAsOBJ = () => {
    if (!meshRef.current) return;
    let objContent = '# 3D Data Visualization\n';
    const geometry = meshRef.current.geometry;
    if (!geometry || !geometry.attributes || !geometry.attributes.position) {
      alert('Cannot export this visualization type as OBJ');
      return;
    }
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      objContent += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
    }
    const blob = new Blob([objContent], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = '3d-visualization.obj';
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  // --- Three.js Setup & Visualization ---
  const createVisualization = (scene, mode, visMode) => {
    if (meshRef.current) {
      scene.remove(meshRef.current);
      if (meshRef.current.geometry) meshRef.current.geometry.dispose();
      if (meshRef.current.material) {
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach((m) => m.dispose());
        } else {
          meshRef.current.material.dispose();
        }
      }
      if (meshRef.current.children) {
        meshRef.current.children.forEach((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    }
    const data = getFilteredData();
    const stats = calculateStatistics(data);
    setStatistics(stats);
    switch (visMode) {
      case 'bars':
        createBarChart(scene, data);
        break;
      case 'particles':
        createParticleCloud(scene, data);
        break;
      case 'heatmap':
        createHeatMap(scene, data);
        break;
      case 'contour':
        createContourMap(scene, data);
        break;
      case 'pointcloud':
        createPointCloud(scene, data);
        break;
      default:
        createSurfaceMesh(scene, data);
    }
  };

  const createSurfaceMesh = (scene, data) => {
    const size = Math.sqrt(data.length);
    const geometry = new THREE.PlaneGeometry(10, 10, size - 1, size - 1);
    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);
    for (let i = 0; i < data.length; i++) {
      const index = i * 3;
      positions[index + 2] = data[i].value;
      const normalizedHeight = (data[i].value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
      colors[index] = normalizedHeight;
      colors[index + 1] = 0.5 - normalizedHeight * 0.3;
      colors[index + 2] = 1 - normalizedHeight;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      wireframe: false,
      metalness: 0.3,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;
  };

  const createBarChart = (scene, data) => {
    const group = new THREE.Group();
    data.forEach((point, idx) => {
      if (idx % 5 !== 0) return;
      const height = Math.abs(point.value) + 0.1;
      const geometry = new THREE.BoxGeometry(0.3, height, 0.3);
      const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
      const color = new THREE.Color();
      color.setHSL(0.6 - normalizedHeight * 0.6, 1, 0.5);
      const material = new THREE.MeshStandardMaterial({ color });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.set((point.x - 25) * 0.2, height / 2, (point.z - 25) * 0.2);
      group.add(bar);
    });
    scene.add(group);
    meshRef.current = group;
  };

  const createParticleCloud = (scene, data) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(data.length * 3);
    const colors = new Float32Array(data.length * 3);
    const sizes = new Float32Array(data.length);
    data.forEach((point, i) => {
      positions[i * 3] = (point.x - 25) * 0.2;
      positions[i * 3 + 1] = point.value;
      positions[i * 3 + 2] = (point.z - 25) * 0.2;
      const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
      colors[i * 3] = normalizedHeight;
      colors[i * 3 + 1] = 0.5;
      colors[i * 3 + 2] = 1 - normalizedHeight;
      sizes[i] = 0.1 + normalizedHeight * 0.2;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    meshRef.current = particles;
  };

  const createHeatMap = (scene, data) => {
    const size = Math.sqrt(data.length);
    const geometry = new THREE.PlaneGeometry(10, 10, size - 1, size - 1);
    const colors = new Float32Array(data.length * 3);
    data.forEach((point, i) => {
      const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
      const color = new THREE.Color();
      color.setHSL(0.7 - normalizedHeight * 0.7, 1, 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    });
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;
  };

  const createContourMap = (scene, data) => {
    const size = Math.sqrt(data.length);
    const geometry = new THREE.PlaneGeometry(10, 10, size - 1, size - 1);
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < data.length; i++) {
      const index = i * 3;
      positions[index + 2] = data[i].value * 0.5;
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;
  };

  const createPointCloud = (scene, data) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(data.length * 3);
    const colors = new Float32Array(data.length * 3);
    data.forEach((point, i) => {
      positions[i * 3] = (point.x - 25) * 0.2;
      positions[i * 3 + 1] = point.value;
      positions[i * 3 + 2] = (point.z - 25) * 0.2;
      const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
      colors[i * 3] = normalizedHeight;
      colors[i * 3 + 1] = 0.7;
      colors[i * 3 + 2] = 1 - normalizedHeight;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    meshRef.current = points;
  };

  const resetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(15, 12, 15);
      cameraRef.current.lookAt(0, 0, 0);
      setIsRotating(true);
    }
  };

  // --- useEffect Hooks ---
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    const pointLight1 = new THREE.PointLight(0x00ffff, 0.5);
    pointLight1.position.set(-10, 5, -10);
    scene.add(pointLight1);
    const pointLight2 = new THREE.PointLight(0xff00ff, 0.5);
    pointLight2.position.set(10, 5, 10);
    scene.add(pointLight2);
    const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
    scene.add(gridHelper);
    createVisualization(scene, dataMode, vizMode);
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const onMouseDown = (e) => {
      isDragging = true;
      setIsRotating(false);
    };
    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        camera.position.x += deltaX * 0.05 * Math.cos(camera.rotation.y);
        camera.position.z += deltaX * 0.05 * Math.sin(camera.rotation.y);
        camera.position.y += deltaY * 0.05;
        camera.lookAt(0, 0, 0);
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDragging = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.01;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      camera.position.addScaledVector(direction, delta);
    };
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel);
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      if (isRotating) {
        camera.position.x = Math.cos(Date.now() * 0.0003) * 15;
        camera.position.z = Math.sin(Date.now() * 0.0003) * 15;
        camera.lookAt(0, 0, 0);
      }
      if (meshRef.current && meshRef.current.geometry && meshRef.current.geometry.attributes && meshRef.current.geometry.attributes.position) {
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const intersects = raycasterRef.current.intersectObject(meshRef.current, true);
        if (intersects.length > 0) {
          const point = intersects[0].point;
          setHoveredPoint({
            x: point.x.toFixed(2),
            y: point.y.toFixed(2),
            z: point.z.toFixed(2),
          });
        } else {
          setHoveredPoint(null);
        }
      }
      renderer.render(scene, camera);
    };
    animate();
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) {
      createVisualization(sceneRef.current, dataMode, vizMode);
    }
  }, [dataMode, vizMode, filterRange, searchValue, currentData]);

  // --- Render ---
  return (
    <div className="w-full h-screen bg-gray-950 relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-2xl max-w-xs">
        <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
          <Maximize2 size={20} className="text-cyan-400" />
          3D Data Visualizer
        </h2>
        <div className="space-y-3">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded font-medium flex items-center justify-center gap-2 transition-all"
            >
              <Upload size={18} />
              Upload CSV/JSON
            </button>
          </div>
          <div>
            <label className="text-gray-300 text-sm mb-2 block">Dataset</label>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value)}
              className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
            >
              <option value="wave">Wave Function</option>
              <option value="peaks">Gaussian Peaks</option>
              <option value="terrain">Terrain</option>
              <option value="random">Random Data</option>
              {uploadedData && <option value="uploaded">Uploaded Data</option>}
            </select>
          </div>
          <div>
            <label className="text-gray-300 text-sm mb-2 block">Visualization</label>
            <select
              value={vizMode}
              onChange={(e) => setVizMode(e.target.value)}
              className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
            >
              <option value="surface">Surface Mesh</option>
              <option value="bars">3D Bar Chart</option>
              <option value="particles">Particle Cloud</option>
              <option value="heatmap">Heat Map</option>
              <option value="contour">Contour Lines</option>
              <option value="pointcloud">Point Cloud</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsRotating(!isRotating)}
              className={`flex-1 px-3 py-2 rounded font-medium transition-all text-sm ${
                isRotating
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {isRotating ? 'Auto ON' : 'Auto OFF'}
            </button>
            <button
              onClick={resetCamera}
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium flex items-center justify-center gap-2 transition-all text-sm"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium flex items-center justify-center gap-2 transition-all text-sm"
          >
            <Filter size={18} />
            Filters & Analysis
          </button>
        </div>
      </div>
      {statistics && (
        <div className="absolute top-4 right-4 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-2xl max-w-xs">
          <div className="flex items-start gap-2 mb-2">
            <TrendingUp size={18} className="text-cyan-400 mt-1" />
            <div>
              <h3 className="text-white font-semibold mb-2">Statistics</h3>
              <div className="text-gray-300 text-sm space-y-1">
                <p>
                  Points: <span className="text-cyan-400">{statistics.total}</span>
                </p>
                <p>
                  Mean: <span className="text-cyan-400">{statistics.mean.toFixed(2)}</span>
                </p>
                <p>
                  Median: <span className="text-cyan-400">{statistics.median.toFixed(2)}</span>
                </p>
                <p>
                  Min: <span className="text-green-400">{statistics.min.toFixed(2)}</span>
                </p>
                <p>
                  Max: <span className="text-red-400">{statistics.max.toFixed(2)}</span>
                </p>
                <p>
                  Std Dev: <span className="text-yellow-400">{statistics.stdDev.toFixed(2)}</span>
                </p>
                <p>
                  Outliers: <span className="text-purple-400">{statistics.outliers}</span>
                </p>
              </div>
            </div>
          </div>
          {hoveredPoint && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-cyan-400 text-sm font-mono">
                X: {hoveredPoint.x}
                <br />
                Y: {hoveredPoint.y}
                <br />
                Z: {hoveredPoint.z}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="absolute bottom-4 left-4 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 border border-gray-700 shadow-2xl">
        <div className="flex gap-2">
          <button
            onClick={exportAsPNG}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium flex items-center gap-2 transition-all text-sm"
            title="Export as PNG"
          >
            <Download size={16} />
            PNG
          </button>
          <button
            onClick={exportAsOBJ}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium flex items-center gap-2 transition-all text-sm"
            title="Export as OBJ"
          >
            <FileJson size={16} />
            OBJ
          </button>
          <button
            onClick={shareAsURL}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium flex items-center gap-2 transition-all text-sm"
            title="Share URL"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>
      </div>
      {showFilters && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-gray-900/95 backdrop-blur-md rounded-lg p-6 border border-gray-700 shadow-2xl w-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Filter size={20} className="text-cyan-400" />
              Filters & Analysis
            </h3>
            <button
              onClick={() => setShowFilters(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-gray-300 text-sm mb-2 block">Filter by Value Range</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filterRange.min === -Infinity ? '' : filterRange.min}
                  onChange={(e) =>
                    setFilterRange((prev) => ({ ...prev, min: e.target.value ? parseFloat(e.target.value) : -Infinity }))
                  }
                  className="flex-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filterRange.max === Infinity ? '' : filterRange.max}
                  onChange={(e) =>
                    setFilterRange((prev) => ({ ...prev, max: e.target.value ? parseFloat(e.target.value) : Infinity }))
                  }
                  className="flex-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-gray-300 text-sm mb-2 block">Search Specific Value (±0.5)</label>
              <input
                type="number"
                placeholder="Enter value"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-gray-300 text-sm mb-2 block">Quick Filters</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (statistics) {
                      setFilterRange({ min: statistics.mean, max: statistics.max });
                    }
                  }}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
                >
                  Above Mean
                </button>
                <button
                  onClick={() => {
                    if (statistics) {
                      setFilterRange({ min: statistics.min, max: statistics.mean });
                    }
                  }}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                >
                  Below Mean
                </button>
                <button
                  onClick={() => {
                    if (statistics) {
                      const outlierThreshold = statistics.mean + 2 * statistics.stdDev;
                      setFilterRange({ min: outlierThreshold, max: Infinity });
                    }
                  }}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                >
                  Outliers High
                </button>
                <button
                  onClick={() => {
                    if (statistics) {
                      const outlierThreshold = statistics.mean - 2 * statistics.stdDev;
                      setFilterRange({ min: -Infinity, max: outlierThreshold });
                    }
                  }}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm"
                >
                  Outliers Low
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                setFilterRange({ min: -Infinity, max: Infinity });
                setSearchValue('');
              }}
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition-all text-sm"
            >
              Reset All Filters
            </button>
          </div>
        </div>
      )}
      {showMapping && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-gray-900/95 backdrop-blur-md rounded-lg p-6 border border-gray-700 shadow-2xl w-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Grid3x3 size={20} className="text-cyan-400" />
              Map Columns to Axes
            </h3>
            <button
              onClick={() => setShowMapping(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-gray-300 text-sm mb-2 block">X Axis</label>
              <select
                value={columnMapping.x}
                onChange={(e) => setColumnMapping((prev) => ({ ...prev, x: e.target.value }))}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">Select column...</option>
                {availableColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-300 text-sm mb-2 block">Y Axis (Value/Height)</label>
              <select
                value={columnMapping.y}
                onChange={(e) => setColumnMapping((prev) => ({ ...prev, y: e.target.value }))}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">Select column...</option>
                {availableColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-300 text-sm mb-2 block">Z Axis</label>
              <select
                value={columnMapping.z}
                onChange={(e) => setColumnMapping((prev) => ({ ...prev, z: e.target.value }))}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">Select column...</option>
                {availableColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-gray-800 rounded p-3 text-xs text-gray-400">
              <p className="mb-1">📊 Available columns:</p>
              <p className="font-mono">{availableColumns.join(', ')}</p>
            </div>
            <button
              onClick={applyMapping}
              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded font-medium transition-all"
            >
              Apply Mapping
            </button>
          </div>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-950 to-transparent pointer-events-none" />
    </div>
  );
};

export default DataVisualizer3D;
