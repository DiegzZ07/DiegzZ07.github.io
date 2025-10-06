// www/js/geo.js

const LATITUDE_GENEVE = 46.2044;
const LONGITUDE_GENEVE = 6.1432;

const isNative = !!window.Capacitor?.isNativePlatform?.();
const FS = window.Capacitor?.Plugins?.Filesystem;
const DATA_DIR = "DATA";
const POIS_JSON = "pois.json";
const PHOTOS_DIR = "photos";

let video = document.querySelector("#video");
let canvas = document.querySelector("#canvas");
let descInput = document.querySelector("#desc");
let stream = null;

// Carte
let map = L.map("map").setView([LATITUDE_GENEVE, LONGITUDE_GENEVE], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// Caméra
async function startCam() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { exact: "environment" } }
  });
  video.srcObject = stream;
}
function stopCam() {
  stream?.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

// Photo -> dataURL
function prendrePhoto() {
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

// FS helpers
async function ensurePhotosDir() {
  if (!(isNative && FS)) return;
  try {
    await FS.mkdir({ path: PHOTOS_DIR, directory: DATA_DIR, recursive: true });
  } catch {}
}
async function readPois() {
  if (isNative && FS) {
    try {
      const r = await FS.readFile({ path: POIS_JSON, directory: DATA_DIR, encoding: "UTF8" });
      return JSON.parse(r.data || "[]");
    } catch { return []; }
  }
  return JSON.parse(localStorage.getItem("pois") || "[]");
}
async function writePois(pois) {
  if (isNative && FS) {
    await FS.writeFile({
      path: POIS_JSON, directory: DATA_DIR, data: JSON.stringify(pois), encoding: "UTF8"
    });
  } else {
    localStorage.setItem("pois", JSON.stringify(pois));
  }
}
async function savePhotoFile(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const name = `${PHOTOS_DIR}/poi_${Date.now()}.png`;
  await ensurePhotosDir();
  await FS.writeFile({ path: name, directory: DATA_DIR, data: base64 });
  return name; // chemin relatif
}
async function fileToDataUrl(path) {
  const r = await FS.readFile({ path, directory: DATA_DIR });
  return `data:image/png;base64,${r.data}`;
}

// Prendre photo + sauver point (lat, lng, desc, photo)
async function photo() {
  const dataUrl = prendrePhoto();
  const desc = (descInput?.value || "").trim();

  navigator.geolocation.getCurrentPosition(async position => {
    let photoRef;
    if (isNative && FS) {
      const path = await savePhotoFile(dataUrl);
      photoRef = { kind: "file", path };
    } else {
      photoRef = { kind: "dataurl", data: dataUrl };
    }

    const point = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      desc: desc || "(sans description)",
      photo: photoRef,
      ts: Date.now()
    };

    const points = await readPois();
    points.push(point);
    await writePois(points);
    await showPoints(true);
  });
}

// Affichage
async function showPoints(reloadMarkersOnly = false) {
  
  const points = await readPois();

  // nettoie les anciens marqueurs
  map.eachLayer(l => {
    if (l instanceof L.Marker) map.removeLayer(l);
  });

  for (const p of points) {
    let imgSrc;
    if (p.photo?.kind === "file" && isNative && FS) {
      imgSrc = await fileToDataUrl(p.photo.path);
    } else {
      imgSrc = p.photo?.data || "";
    }
    L.marker([p.lat, p.lng])
      .addTo(map)
      .bindPopup(
        `<b>${p.desc ?? ""}</b><br>${imgSrc ? `<img src="${imgSrc}" width="200">` : ""}`
      );
  }

  if (!reloadMarkersOnly && points.length) {
    const last = points[points.length - 1];
    map.setView([last.lat, last.lng], 14);
  }
}
showPoints();

// UI
document.querySelector("#start").onclick = startCam;
document.querySelector("#stop").onclick = stopCam;
document.querySelector("#photo").onclick = photo;
