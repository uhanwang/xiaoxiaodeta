// Window-relative pointer target covering the complete painted character across
// the installed atlas, legacy poses, gestures, and small outfit accessories.
// Keep a narrow transparent gutter at the window edge for click-through.
const PET_HIT_AREA = Object.freeze({ left: 16, right: 234, top: 64, bottom: 304 });

function isPetHitTarget(localX, localY) {
  return localX >= PET_HIT_AREA.left
    && localX <= PET_HIT_AREA.right
    && localY >= PET_HIT_AREA.top
    && localY <= PET_HIT_AREA.bottom;
}

module.exports = { PET_HIT_AREA, isPetHitTarget };
