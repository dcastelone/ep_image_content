'use strict';

// This hook is called **before** the text of a line/segment is processed by the Changeset library.
const collectContentPre = (hook, context) => {
  const classes = context.cls ? context.cls.split(' ') : [];
  let escapedSrc = null;
  let widthValue = null;
  let heightValue = null;
  let aspectRatioValue = null;

  for (const cls of classes) {
      if (cls.startsWith('image:')) {
          escapedSrc = cls.substring(6);
      } else if (cls.startsWith('image-width:')) {
          const potentialWidth = cls.substring(12);
          if (potentialWidth && (potentialWidth === 'auto' || /[0-9]+(%|px|em|rem|vw|vh)?$/.test(potentialWidth) || /^[0-9.]+$/.test(potentialWidth))) {
             widthValue = potentialWidth;
          }
      } else if (cls.startsWith('image-height:')) {
          const potentialHeight = cls.substring(13);
          if (potentialHeight && (potentialHeight === 'auto' || /[0-9]+(%|px|em|rem|vw|vh)?$/.test(potentialHeight) || /^[0-9.]+$/.test(potentialHeight))) {
             heightValue = potentialHeight;
          }
      } else if (cls.startsWith('imageCssAspectRatio:')) {
          const potentialAspectRatio = cls.substring(20);
          if (!isNaN(parseFloat(potentialAspectRatio))) {
            aspectRatioValue = potentialAspectRatio;
          }
      }
  }

  if (escapedSrc) {
    try {
      context.cc.doAttrib(context.state, `image::${escapedSrc}`);
    } catch (e) {
      console.error('[ep_image_insert collectContentPre] Error applying image attribute:', e);
    }
  }
  if (widthValue) {
    try {
        context.cc.doAttrib(context.state, `image-width::${widthValue}`);
    } catch (e) {
        console.error('[ep_image_insert collectContentPre] Error applying image-width attribute:', e);
    }
  }
  if (heightValue) {
    try {
        context.cc.doAttrib(context.state, `image-height::${heightValue}`);
    } catch (e) {
        console.error('[ep_image_insert collectContentPre] Error applying image-height attribute:', e);
    }
  }
  if (aspectRatioValue) {
    try {
        context.cc.doAttrib(context.state, `imageCssAspectRatio::${aspectRatioValue}`);
    } catch (e) {
        console.error('[ep_image_insert collectContentPre] Error applying imageCssAspectRatio attribute:', e);
    }
  }
};

// This hook is called **after** the text of a line/segment is processed.
// We don't need special post-processing for this attribute approach.
const collectContentPost = (hook, context) => {};

// Remove collectContentImage as it's not suitable for non-<img> elements
// const collectContentImage = ... (Removed)

exports.collectContentPre = collectContentPre;
exports.collectContentPost = collectContentPost;
