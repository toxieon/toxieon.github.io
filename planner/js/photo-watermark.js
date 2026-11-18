/* Display-only watermark strip for viewer + print/PDF (never mutates Drive files). */

function photoWatermarkLines(node, image) {
  const proj = node ? projectById(node.projectId) : project();
  const floor = node ? floorById(projectById(node.projectId), node.floorId) : currentFloor();
  const room = node?.roomId ? roomById(node.roomId) : null;
  const aptTag = (node?.tags || []).find((t) => /^apt:/i.test(t));
  const folderApt = image?.sourceFolderApt || (aptTag ? aptTag.replace(/^apt:/i, "") : "");
  const apt = room?.name || folderApt || "";
  const parts = [
    apt ? `Apt ${apt}` : "",
    room ? `Room ${room.name}` : (node?.roomId ? `Room ${roomLabel(node.roomId)}` : ""),
    node ? nodeDisplayTitle(node) : "",
    floor?.name ? `Floor ${floor.name}` : "",
    image?.photoDate || image?.uploadedAt || image?.modifiedTime || "",
    node?.status ? `Status ${node.status}` : "",
    node?.category ? node.category : ""
  ].filter(Boolean);
  return parts.length ? parts : ["Photo"];
}

function renderPhotoWatermarkStrip(node, image) {
  const text = photoWatermarkLines(node, image).join(" · ");
  return `<div class="photo-watermark-strip" aria-hidden="true"><span>${escapeHtml(text)}</span></div>`;
}