import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Upload, RotateCcw, Maximize2, Info, Download, Filter, BarChart3,
  Sparkles, TrendingUp, Grid, Share2, FileJson, X, ChevronDown,
  ChevronUp, Layers, Play, Pause, FastForward, Settings, ZoomIn,
  Tag, Square, Repeat, Activity
} from 'lucide-react';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

const DataVisualizer3D = () => {
  // Refs
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const labelRendererRef = useRef(null);
  const animationIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef({ x: 0, y: 0 });

  // State
  const [isRotating, setIsRotating] = useState(true);
  const [dataMode, setDataMode] = useState('wave');
  const [vizMode, setVizMode] = useState('surface');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [clickedPoint, setClickedPoint] = useState(null);
  const [uploadedData, setUploadedData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({ x: '', y: '', z: '', category: '', time: '' });
  const [availableColumns, setAvailableColumns] = useState([]);
  const [categoricalColumns, setCategoricalColumns] = useState([]);
  const [timeColumns, setTimeColumns] = useState([]);
  const [showMapping, setShowMapping] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [categoryStats, setCategoryStats] = useState(null);
  const [filterRange, setFilterRange] = useState({ min: -Infinity, max: Infinity });
  const [searchValue, setSearchValue] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [currentData, setCurrentData] = useState([]);
  const [transformedData, setTransformedData] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [timeSeriesData, setTimeSeriesData] = useState(null);
  const [showTimeControls, setShowTimeControls] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [secondDataset, setSecondDataset] = useState(null);
  const [transform, setTransform] = useState({
    smoothing: false,
    smoothingWindow: 5,
    normalize: false,
    logarithmic: false,
    derivative: false,
    cumulative: false,
    interpolate: false
  });

  // Category colors
  const categoryColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#52B788'
  ];

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

  const detectCategoricalColumns = (data, headers) => {
    const categorical = [];
    headers.forEach(header => {
      const uniqueValues = new Set(data.map(row => row[header]));
      const sampleValue = data[0][header];
      if (uniqueValues.size < 20 && typeof sampleValue === 'string') {
        categorical.push(header);
      }
    });
    return categorical;
  };

  const detectTimeColumns = (data, headers) => {
    const timeKeywords = ['date', 'time', 'timestamp', 'day', 'month', 'year', 'period'];
    return headers.filter(header =>
      timeKeywords.some(keyword => header.toLowerCase().includes(keyword))
    );
  };

  const calculateStatistics = (data) => {
    if (!data || data.length === 0) return null;
    const values = data.map(d => d.value);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const outliers = data.filter(d => Math.abs(d.value - mean) > 2 * stdDev);
    return { mean, median, min, max, stdDev, outliers: outliers.length, total: values.length };
  };

  const calculateCategoryStatistics = (data, categoryColumn) => {
    if (!data || !categoryColumn || data.length === 0) return null;
    const categories = {};
    data.forEach(point => {
      const cat = point.originalData?.[categoryColumn] || 'Unknown';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(point.value);
    });
    const categoryStats = {};
    Object.keys(categories).forEach((cat, index) => {
      const values = categories[cat];
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      categoryStats[cat] = {
        mean, median, min, max, stdDev,
        count: values.length,
        color: categoryColors[index % categoryColors.length]
      };
    });
    return categoryStats;
  };

  // --- Data Transformation Functions ---
  const applySmoothing = (data, window) => {
    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(data.length, i + Math.ceil(window / 2));
      const slice = data.slice(start, end);
      const avg = slice.reduce((sum, d) => sum + d.value, 0) / slice.length;
      smoothed.push({ ...data[i], value: avg, originalValue: data[i].value });
    }
    return smoothed;
  };

  const applyNormalization = (data) => {
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    return data.map(d => ({
      ...d,
      value: range === 0 ? 0 : (d.value - min) / range,
      originalValue: d.value
    }));
  };

  const applyLogarithmic = (data) => {
    return data.map(d => ({
      ...d,
      value: d.value > 0 ? Math.log(d.value + 1) : 0,
      originalValue: d.value
    }));
  };

  const applyDerivative = (data) => {
    const derivative = [{ ...data[0], value: 0 }];
    for (let i = 1; i < data.length; i++) {
      derivative.push({
        ...data[i],
        value: data[i].value - data[i - 1].value,
        originalValue: data[i].value
      });
    }
    return derivative;
  };

  const applyCumulative = (data) => {
    let sum = 0;
    return data.map(d => {
      sum += d.value;
      return { ...d, value: sum, originalValue: d.value };
    });
  };

  const applyInterpolation = (data) => {
    const interpolated = [...data];
    for (let i = 1; i < interpolated.length - 1; i++) {
      if (interpolated[i].value === 0 || isNaN(interpolated[i].value)) {
        interpolated[i].value = (interpolated[i - 1].value + interpolated[i + 1].value) / 2;
      }
    }
    return interpolated;
  };

  const applyTransformations = (data) => {
    let result = [...data];
    if (transform.smoothing) {
      result = applySmoothing(result, transform.smoothingWindow);
    }
    if (transform.normalize) {
      result = applyNormalization(result);
    }
    if (transform.logarithmic) {
      result = applyLogarithmic(result);
    }
    if (transform.derivative) {
      result = applyDerivative(result);
    }
    if (transform.cumulative) {
      result = applyCumulative(result);
    }
    if (transform.interpolate) {
      result = applyInterpolation(result);
    }
    return result;
  };

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
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
        const categorical = detectCategoricalColumns(jsonData, headers);
        const timeCol = detectTimeColumns(jsonData, headers);
        setAvailableColumns(headers);
        setCategoricalColumns(categorical);
        setTimeColumns(timeCol);
        setUploadedData(jsonData);
        setShowMapping(true);
      } else if (file.name.endsWith('.csv')) {
        const { headers, data } = parseCSV(content);
        const categorical = detectCategoricalColumns(data, headers);
        const timeCol = detectTimeColumns(data, headers);
        setAvailableColumns(headers);
        setCategoricalColumns(categorical);
        setTimeColumns(timeCol);
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
      category: columnMapping.category ? row[columnMapping.category] : null,
      time: columnMapping.time ? row[columnMapping.time] : null,
      originalData: row,
    }));
    setCurrentData(mappedData);
    setDataMode('uploaded');
    setShowMapping(false);
    const stats = calculateStatistics(mappedData);
    setStatistics(stats);
    if (columnMapping.category) {
      const catStats = calculateCategoryStatistics(mappedData, columnMapping.category);
      setCategoryStats(catStats);
      setSelectedCategories(Object.keys(catStats));
    }
    if (columnMapping.time) {
      const timeGroups = {};
      mappedData.forEach(point => {
        const timeKey = point.time;
        if (!timeGroups[timeKey]) timeGroups[timeKey] = [];
        timeGroups[timeKey].push(point);
      });
      setTimeSeriesData(timeGroups);
      setShowTimeControls(true);
    }
  };

  const toggleCategory = (category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const getFilteredData = () => {
    let data = dataMode === 'uploaded' ? currentData : generateData(dataMode);
    if (Object.values(transform).some(v => v === true)) {
      data = applyTransformations(data);
      setTransformedData(data);
    }
    if (timeSeriesData && isAnimating && Object.keys(timeSeriesData).length > 0) {
      const timeKeys = Object.keys(timeSeriesData);
      const currentKey = timeKeys[currentTimeIndex % timeKeys.length];
      data = data.filter(d => d.time === currentKey);
    }
    if (columnMapping.category && selectedCategories.length > 0) {
      data = data.filter(d => selectedCategories.includes(d.originalData?.[columnMapping.category]));
    }
    if (filterRange.min !== -Infinity || filterRange.max !== Infinity) {
      data = data.filter(d => d.value >= filterRange.min && d.value <= filterRange.max);
    }
    if (searchValue) {
      const searchNum = parseFloat(searchValue);
      if (!isNaN(searchNum)) {
        data = data.filter(d => Math.abs(d.value - searchNum) < 0.5);
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
      dataMode, vizMode, isRotating, filterRange,
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

  const getCategoryColor = (point) => {
    if (!columnMapping.category || !categoryStats) return null;
    const cat = point.originalData?.[columnMapping.category];
    return categoryStats[cat]?.color;
  };

  // --- Three.js Setup & Visualization ---
  const createVisualization = (scene, mode, visMode) => {
    if (meshRef.current) {
      scene.remove(meshRef.current);
      if (meshRef.current.geometry) meshRef.current.geometry.dispose();
      if (meshRef.current.material) {
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach(m => m.dispose());
        } else {
          meshRef.current.material.dispose();
        }
      }
      if (meshRef.current.children) {
        meshRef.current.children.forEach(child => {
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
      case 'scatter':
        createScatterPlot(scene, data);
        break;
      case 'bubble':
        createBubbleChart(scene, data);
        break;
      case 'isometric':
        createIsometricView(scene, data);
        break;
      case 'voxel':
        createVoxelVisualization(scene, data);
        break;
      default:
        createSurfaceMesh(scene, data);
    }
    if (showLabels) {
      addDataLabels(scene, data);
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
      const categoryColor = getCategoryColor(data[i]);
      if (categoryColor && columnMapping.category) {
        const color = new THREE.Color(categoryColor);
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      } else {
        const normalizedHeight = (data[i].value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        colors[index] = normalizedHeight;
        colors[index + 1] = 0.5 - normalizedHeight * 0.3;
        colors[index + 2] = 1 - normalizedHeight;
      }
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
      let color;
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        color = new THREE.Color(categoryColor);
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        color = new THREE.Color();
        color.setHSL(0.6 - normalizedHeight * 0.6, 1, 0.5);
      }
      const material = new THREE.MeshStandardMaterial({ color });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.set((point.x - 25) * 0.2, height / 2, (point.z - 25) * 0.2);
      bar.userData = { point };
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
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        const color = new THREE.Color(categoryColor);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        colors[i * 3] = normalizedHeight;
        colors[i * 3 + 1] = 0.5;
        colors[i * 3 + 2] = 1 - normalizedHeight;
      }
      sizes[i] = 0.1 + Math.abs(point.value) * 0.02;
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
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        const color = new THREE.Color(categoryColor);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        const color = new THREE.Color();
        color.setHSL(0.7 - normalizedHeight * 0.7, 1, 0.5);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
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
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        const color = new THREE.Color(categoryColor);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        colors[i * 3] = normalizedHeight;
        colors[i * 3 + 1] = 0.7;
        colors[i * 3 + 2] = 1 - normalizedHeight;
      }
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

  const createScatterPlot = (scene, data) => {
    const group = new THREE.Group();
    data.forEach((point, idx) => {
      const size = 0.1 + Math.abs(point.value) * 0.05;
      const geometry = new THREE.SphereGeometry(size, 8, 8);
      let color;
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        color = new THREE.Color(categoryColor);
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        color = new THREE.Color();
        color.setHSL(0.6 - normalizedHeight * 0.6, 1, 0.5);
      }
      const material = new THREE.MeshStandardMaterial({ color });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set((point.x - 25) * 0.2, point.value, (point.z - 25) * 0.2);
      sphere.userData = { point };
      group.add(sphere);
    });
    scene.add(group);
    meshRef.current = group;
  };

  const createBubbleChart = (scene, data) => {
    const group = new THREE.Group();
    data.forEach((point, idx) => {
      if (idx % 3 !== 0) return;
      const size = 0.2 + Math.abs(point.value) * 0.1;
      const geometry = new THREE.SphereGeometry(size, 16, 16);
      let color;
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        color = new THREE.Color(categoryColor);
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        color = new THREE.Color();
        color.setHSL(0.6 - normalizedHeight * 0.6, 1, 0.5);
      }
      const material = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.7
      });
      const bubble = new THREE.Mesh(geometry, material);
      bubble.position.set((point.x - 25) * 0.2, point.value, (point.z - 25) * 0.2);
      bubble.userData = { point };
      group.add(bubble);
    });
    scene.add(group);
    meshRef.current = group;
  };

  const createIsometricView = (scene, data) => {
    const group = new THREE.Group();
    data.forEach((point, idx) => {
      if (idx % 3 !== 0) return;
      const height = Math.abs(point.value) * 0.5 + 0.2;
      const geometry = new THREE.BoxGeometry(0.4, height, 0.4);
      let color;
      const categoryColor = getCategoryColor(point);
      if (categoryColor && columnMapping.category) {
        color = new THREE.Color(categoryColor);
      } else {
        const normalizedHeight = (point.value - (statistics?.min || -3)) / ((statistics?.max || 3) - (statistics?.min || -3));
        color = new THREE.Color();
        color.setHSL(0.6 - normalizedHeight * 0.6, 1, 0.5);
      }
      const material = new THREE.MeshLambertMaterial({ color });
      const block = new THREE.Mesh(geometry, material);
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      block.add(wireframe);
      block.position.set((point.x - 25) * 0.2, height / 2, (point.z - 25) * 0.2);
      block.userData = { point };
      group.add(block);
    });
    scene.add(group);
    meshRef.current = group;
  };

  const createVoxelVisualization = (scene, data) => {
    const group = new THREE.Group();
    const voxelSize = 0.3;
    data.forEach((point, idx) => {
      if (idx % 4 !== 0) return;
      const layers = Math.floor(Math.abs(point.value) + 1);
      for (let y = 0; y < layers; y++) {
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        let color;
        const categoryColor = getCategoryColor(point);
        if (categoryColor && columnMapping.category) {
          color = new THREE.Color(categoryColor);
        } else {
          const normalizedHeight = y / layers;
          color = new THREE.Color();
          color.setHSL(0.6 - normalizedHeight * 0.6, 1, 0.5);
        }
        const material = new THREE.MeshLambertMaterial({ color });
        const voxel = new THREE.Mesh(geometry, material);
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x333333 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        voxel.add(wireframe);
        voxel.position.set(
          (point.x - 25) * 0.2,
          y * voxelSize + voxelSize / 2,
          (point.z - 25) * 0.2
        );
        voxel.userData = { point };
        group.add(voxel);
      }
    });
    scene.add(group);
    meshRef.current = group;
  };

  const addDataLabels = (scene, data) => {
    selectedPoints.forEach(point => {
      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = point.value?.toFixed(2);
      labelDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      labelDiv.style.color = 'white';
      labelDiv.style.padding = '4px 8px';
      labelDiv.style.borderRadius = '4px';
      labelDiv.style.fontSize = '12px';
      labelDiv.style.pointerEvents = 'none';

      const label = new CSS2DObject(labelDiv);
      label.position.set(
        (point.x - 25) * 0.2,
        point.value + 0.5,
        (point.z - 25) * 0.2
      );
      scene.add(label);
    });
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

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Label renderer setup
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mountRef.current.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    // Lights
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

    // Grid
    const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Initial visualization
    createVisualization(scene, dataMode, vizMode);

    // Mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      if (e.button === 0) {
        isDragging = true;
        setIsRotating(false);
        const rect = renderer.domElement.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        if (meshRef.current) {
          const intersects = raycasterRef.current.intersectObject(meshRef.current, true);
          if (intersects.length > 0 && intersects[0].object.userData?.point) {
            setClickedPoint(intersects[0].object.userData.point);
          }
        }
      }
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

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      if (isRotating) {
        camera.position.x = Math.cos(Date.now() * 0.0003) * 15;
        camera.position.z = Math.sin(Date.now() * 0.0003) * 15;
        camera.lookAt(0, 0, 0);
      }
      if (meshRef.current?.geometry?.attributes?.position) {
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
      if (labelRendererRef.current) {
        labelRendererRef.current.render(scene, camera);
      }
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      labelRendererRef.current?.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
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
      if (mountRef.current && labelRendererRef.current?.domElement) {
        mountRef.current.removeChild(labelRendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) {
      createVisualization(sceneRef.current, dataMode, vizMode);
    }
  }, [dataMode, vizMode, filterRange, searchValue, currentData, selectedCategories, currentTimeIndex, transform, showLabels]);

  useEffect(() => {
    if (!isAnimating || !timeSeriesData) return;
    const interval = setInterval(() => {
      setCurrentTimeIndex(prev => (prev + 1) % Object.keys(timeSeriesData).length);
    }, 1000 / animationSpeed);
    return () => clearInterval(interval);
  }, [isAnimating, animationSpeed, timeSeriesData]);

  // --- Render ---
  return (
    <div className="w-full h-screen bg-gray-950 relative overflow-hidden">
      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-2xl max-w-xs max-h-[90vh] overflow-y-auto">
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
              <option value="scatter">Scatter Plot 3D</option>
              <option value="bubble">Bubble Chart</option>
              <option value="isometric">Isometric View</option>
              <option value="voxel">Voxel (Minecraft)</option>
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`flex-1 px-3 py-2 rounded font-medium transition-all text-sm flex items-center justify-center gap-1 ${
                showLabels
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              <Tag size={16} />
              Labels
            </button>
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`flex-1 px-3 py-2 rounded font-medium transition-all text-sm flex items-center justify-center gap-1 ${
                compareMode
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              <Repeat size={16} />
              Compare
            </button>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium flex items-center justify-center gap-2 transition-all text-sm"
          >
            <Filter size={18} />
            Filters & Analysis
          </button>
          <button
            onClick={() => setShowTransformPanel(!showTransformPanel)}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium flex items-center justify-center gap-2 transition-all text-sm"
          >
            <Activity size={18} />
            Transform Data
          </button>
          {categoryStats && (
            <button
              onClick={() => setShowCategoryPanel(!showCategoryPanel)}
              className="w-full px-4 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white rounded font-medium flex items-center justify-center gap-2 transition-all text-sm"
            >
              <Layers size={18} />
              Category Analysis
            </button>
          )}
        </div>
      </div>

      {/* Time-Series Animation Controls */}
      {showTimeControls && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-2xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAnimating(!isAnimating)}
              className={`px-4 py-2 rounded font-medium transition-all flex items-center gap-2 ${
                isAnimating
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isAnimating ? <Pause size={18} /> : <Play size={18} />}
              {isAnimating ? 'Pause' : 'Play'}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-gray-300 text-sm">Speed:</label>
              <select
                value={animationSpeed}
                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="5">5x</option>
              </select>
            </div>
            {timeSeriesData && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max={Object.keys(timeSeriesData).length - 1}
                  value={currentTimeIndex}
                  onChange={(e) => setCurrentTimeIndex(parseInt(e.target.value))}
                  className="w-32"
                />
                <span className="text-gray-300 text-sm">
                  {Object.keys(timeSeriesData)[currentTimeIndex]}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statistics Panel */}
      {statistics && (
        <div className="absolute top-4 right-4 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-2xl max-w-xs">
          <div className="flex items-start gap-2 mb-2">
            <TrendingUp size={18} className="text-cyan-400 mt-1" />
            <div>
              <h3 className="text-white font-semibold mb-2">Statistics</h3>
              <div className="text-gray-300 text-sm space-y-1">
                <p>Points: <span className="text-cyan-400">{statistics.total}</span></p>
                <p>Mean: <span className="text-cyan-400">{statistics.mean.toFixed(2)}</span></p>
                <p>Median: <span className="text-cyan-400">{statistics.median.toFixed(2)}</span></p>
                <p>Min: <span className="text-green-400">{statistics.min.toFixed(2)}</span></p>
                <p>Max: <span className="text-red-400">{statistics.max.toFixed(2)}</span></p>
                <p>Std Dev: <span className="text-yellow-400">{statistics.stdDev.toFixed(2)}</span></p>
                <p>Outliers: <span className="text-purple-400">{statistics.outliers}</span></p>
              </div>
            </div>
          </div>
          {hoveredPoint && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-cyan-400 text-sm font-mono">
                X: {hoveredPoint.x}<br />
                Y: {hoveredPoint.y}<br />
                Z: {hoveredPoint.z}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Clicked Point Detail Modal */}
      {clickedPoint && (
        <div className="absolute top-1/2 right-4 transform -translate-y-1/2 z-20 bg-gray-900/95 backdrop-blur-md rounded-lg p-4 border border-cyan-500 shadow-2xl w-64">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Info size={18} className="text-cyan-400" />
              Data Point Details
            </h3>
            <button
              onClick={() => setClickedPoint(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="text-gray-300 text-sm space-y-2">
            <p><strong>Value:</strong> <span className="text-cyan-400">{clickedPoint.value?.toFixed(4)}</span></p>
            <p><strong>X:</strong> {clickedPoint.x}</p>
            <p><strong>Y:</strong> {clickedPoint.y}</p>
            <p><strong>Z:</strong> {clickedPoint.z}</p>
            {clickedPoint.category && (
              <p><strong>Category:</strong> <span className="text-pink-400">{clickedPoint.category}</span></p>
            )}
            {clickedPoint.time && (
              <p><strong>Time:</strong> <span className="text-yellow-400">{clickedPoint.time}</span></p>
            )}
            {clickedPoint.originalValue && (
              <p><strong>Original:</strong> {clickedPoint.originalValue.toFixed(4)}</p>
            )}
            {clickedPoint.originalData && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs font-semibold mb-2">All Fields:</p>
                <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                  {Object.entries(clickedPoint.originalData).map(([key, value]) => (
                    <p key={key}><strong>{key}:</strong> {value}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setSelectedPoints(prev => [...prev, clickedPoint]);
              setClickedPoint(null);
            }}
            className="w-full mt-3 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm transition-all"
          >
            Add to Selection
          </button>
        </div>
      )}

      {/* Data Transformation Panel */}
      {showTransformPanel && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-gray-900/95 backdrop-blur-md rounded-lg p-6 border border-gray-700 shadow-2xl w-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Activity size={20} className="text-indigo-400" />
              Data Transformations
            </h3>
            <button
              onClick={() => setShowTransformPanel(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-gray-300 text-sm">Smoothing</label>
              <input
                type="checkbox"
                checked={transform.smoothing}
                onChange={(e) => setTransform(prev => ({ ...prev, smoothing: e.target.checked }))}
                className="w-4 h-4"
              />
            </div>
            {transform.smoothing && (
              <div className="ml-4">
                <label className="text-gray-400 text-xs">Window Size: {transform.smoothingWindow}</label>
                <input
                  type="range"
                  min="3"
                  max="15"
                  step="2"
                  value={transform.smoothingWindow}
                  onChange={(e) => setTransform(prev => ({ ...prev, smoothingWindow: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="text-gray-300 text-sm">Normalize (0-1)</label>
              <input
                type="checkbox"
                checked={transform.normalize}
                onChange={(e) => setTransform(prev => ({ ...prev, normalize: e.target.checked }))}
                className="w-4 h-4"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-300 text-sm">Logarithmic Scale</label>
              <input
                type="checkbox"
                checked={transform.logarithmic}
                onChange={(e) => setTransform(prev => ({ ...prev, logarithmic: e.target.checked }))}
                className="w-4 h-4"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-300 text-sm">Derivative</label>
              <input
                type="checkbox"
                checked={transform.derivative}
                onChange={(e) => setTransform(prev => ({ ...prev, derivative: e.target.checked }))}
                className="w-4 h-4"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-300 text-sm">Cumulative Sum</label>
              <input
                type="checkbox"
                checked={transform.cumulative}
                onChange={(e) => setTransform(prev => ({ ...prev, cumulative: e.target.checked }))}
                className="w-4 h-4"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-300 text-sm">Interpolate Missing</label>
              <input
                type="checkbox"
                checked={transform.interpolate}
                onChange={(e) => setTransform(prev => ({ ...prev, interpolate: e.target.checked }))}
                className="w-4 h-4"
              />
            </div>
            <div className="pt-3 border-t border-gray-700">
              <button
                onClick={() => setTransform({
                  smoothing: false,
                  smoothingWindow: 5,
                  normalize: false,
                  logarithmic: false,
                  derivative: false,
                  cumulative: false,
                  interpolate: false
                })}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition-all text-sm"
              >
                Reset All Transformations
              </button>
            </div>
            {transformedData && (
              <div className="bg-gray-800 rounded p-3 text-xs text-gray-400">
                <p>✓ Transformations applied to {transformedData.length} data points</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category Analysis Panel */}
      {showCategoryPanel && categoryStats && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-gray-900/95 backdrop-blur-md rounded-lg p-6 border border-gray-700 shadow-2xl w-[500px] max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Layers size={20} className="text-pink-400" />
              Category Analysis
            </h3>
            <button
              onClick={() => setShowCategoryPanel(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="mb-4 p-3 bg-gray-800 rounded">
            <p className="text-gray-300 text-sm mb-2">
              <strong>Column:</strong> {columnMapping.category}
            </p>
            <p className="text-gray-300 text-sm">
              <strong>Total Categories:</strong> {Object.keys(categoryStats).length}
            </p>
          </div>
          <div className="space-y-3">
            {Object.entries(categoryStats).map(([category, stats]) => (
              <div
                key={category}
                className="bg-gray-800 rounded-lg p-4 border-l-4 transition-all"
                style={{ borderLeftColor: stats.color }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: stats.color }}
                    ></div>
                    <h4 className="text-white font-semibold">{category}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCategory(category)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                        selectedCategories.includes(category)
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {selectedCategories.includes(category) ? 'Visible' : 'Hidden'}
                    </button>
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {expandedCategory === category ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                  <p>Count: <span className="text-cyan-400">{stats.count}</span></p>
                  <p>Mean: <span className="text-cyan-400">{stats.mean.toFixed(2)}</span></p>
                </div>
                {expandedCategory === category && (
                  <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 gap-2 text-xs text-gray-300">
                    <p>Median: <span className="text-cyan-400">{stats.median.toFixed(2)}</span></p>
                    <p>Std Dev: <span className="text-yellow-400">{stats.stdDev.toFixed(2)}</span></p>
                    <p>Min: <span className="text-green-400">{stats.min.toFixed(2)}</span></p>
                    <p>Max: <span className="text-red-400">{stats.max.toFixed(2)}</span></p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setSelectedCategories(Object.keys(categoryStats))}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-all text-sm"
            >
              Show All
            </button>
            <button
              onClick={() => setSelectedCategories([])}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-all text-sm"
            >
              Hide All
            </button>
          </div>
        </div>
      )}

      {/* Filter Panel */}
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
                    setFilterRange(prev => ({ ...prev, min: e.target.value ? parseFloat(e.target.value) : -Infinity }))
                  }
                  className="flex-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filterRange.max === Infinity ? '' : filterRange.max}
                  onChange={(e) =>
                    setFilterRange(prev => ({ ...prev, max: e.target.value ? parseFloat(e.target.value) : Infinity }))
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

      {/* Export Panel */}
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

      {/* Column Mapping Modal */}
      {showMapping && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-gray-900/95 backdrop-blur-md rounded-lg p-6 border border-gray-700 shadow-2xl w-96 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Grid size={20} className="text-cyan-400" />
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
                onChange={(e) => setColumnMapping(prev => ({ ...prev, x: e.target.value }))}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">Select column...</option>
                {availableColumns.map(col => (
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
                onChange={(e) => setColumnMapping(prev => ({ ...prev, y: e.target.value }))}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">Select column...</option>
                {availableColumns.map(col => (
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
                onChange={(e) => setColumnMapping(prev => ({ ...prev, z: e.target.value }))}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">Select column...</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
            {/* Category Column Selector */}
            {categoricalColumns.length > 0 && (
              <div className="pt-3 border-t border-gray-700">
                <label className="text-gray-300 text-sm mb-2 block flex items-center gap-2">
                  <Layers size={16} className="text-pink-400" />
                  Category Column (Optional)
                </label>
                <select
                  value={columnMapping.category}
                  onChange={(e) => setColumnMapping(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
                >
                  <option value="">None</option>
                  {categoricalColumns.map(col => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select a column to group data by categories
                </p>
              </div>
            )}
            {/* Time Column Selector */}
            {timeColumns.length > 0 && (
              <div className="pt-3 border-t border-gray-700">
                <label className="text-gray-300 text-sm mb-2 block flex items-center gap-2">
                  <Play size={16} className="text-green-400" />
                  Time Column (For Animation)
                </label>
                <select
                  value={columnMapping.time}
                  onChange={(e) => setColumnMapping(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm"
                >
                  <option value="">None</option>
                  {timeColumns.map(col => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select a time column to enable animation
                </p>
              </div>
            )}
            <div className="bg-gray-800 rounded p-3 text-xs text-gray-400">
              <p className="mb-1">📊 Available columns:</p>
              <p className="font-mono">{availableColumns.join(', ')}</p>
              {categoricalColumns.length > 0 && (
                <>
                  <p className="mb-1 mt-2">🏷️ Categorical columns:</p>
                  <p className="font-mono text-pink-400">{categoricalColumns.join(', ')}</p>
                </>
              )}
              {timeColumns.length > 0 && (
                <>
                  <p className="mb-1 mt-2">⏱️ Time columns:</p>
                  <p className="font-mono text-green-400">{timeColumns.join(', ')}</p>
                </>
              )}
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
