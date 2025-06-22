'use strict';

const Changeset = require('ep_etherpad-lite/static/js/Changeset');
const Security = require('ep_etherpad-lite/static/js/security');

exports.getLineHTMLForExport = async (hook, context) => {
  const attribLine = context.attribLine;
  const apool = context.apool;

  if (attribLine) {
    let generatedHTML = '';
    let currentPos = 0;
    const opIter = Changeset.opIterator(attribLine);

    while (opIter.hasNext()) {
      const op = opIter.next();
      const opChars = op.chars;
      const textSegment = context.text.substring(currentPos, currentPos + opChars);

      let htmlSegment = Security.escapeHTML(textSegment); // Default: escaped text

      // Check for our image attribute
      const imageSrcAttrib = Changeset.opAttributeValue(op, 'image', apool);
      const imageWidthAttrib = Changeset.opAttributeValue(op, 'image-width', apool);
      const imageHeightAttrib = Changeset.opAttributeValue(op, 'image-height', apool);
      const imageIdAttrib = Changeset.opAttributeValue(op, 'image-id', apool);
      // const imageAspectRatioAttrib = Changeset.opAttributeValue(op, 'imageCssAspectRatio', apool); // Not directly used for img tag but good to know it exists

      if (imageSrcAttrib) {
        try {
          const decodedSrc = decodeURIComponent(imageSrcAttrib);
          if (decodedSrc && (decodedSrc.startsWith('data:') || decodedSrc.startsWith('http') || decodedSrc.startsWith('/'))) {
            let imgTag = `<img src="${Security.escapeHTML(decodedSrc)}"`;

            let styles = 'display:inline-block; max-width:100%; height:auto;'; // Default styles

            if (imageWidthAttrib) {
              const widthValue = imageWidthAttrib.replace(/px$/, '');
              imgTag += ` width="${Security.escapeHTMLAttribute(widthValue)}"`;
              styles += ` width:${Security.escapeHTMLAttribute(imageWidthAttrib)};`;
            }
            if (imageHeightAttrib) {
              const heightValue = imageHeightAttrib.replace(/px$/, '');
              imgTag += ` height="${Security.escapeHTMLAttribute(heightValue)}"`;
              // If height is set, override height:auto
              styles = styles.replace('height:auto;', `height:${Security.escapeHTMLAttribute(imageHeightAttrib)};`);
            }

            if (imageIdAttrib) {
              imgTag += ` data-image-id="${Security.escapeHTMLAttribute(imageIdAttrib)}"`;
            }

            imgTag += ` style="${styles}"`;
            imgTag += `>`;
            htmlSegment = imgTag;
          } else {
             console.warn(`[ep_images_extended exportHTML] Invalid unescaped image src: ${decodedSrc}`);
             // Keep default htmlSegment (escaped placeholder text) or specific error
             htmlSegment = '[Invalid Image Src]';
          }
        } catch (e) {
          console.error(`[ep_images_extended exportHTML] Error processing image attribute: ${imageSrcAttrib}`, e);
          htmlSegment = '[Image Processing Error]';
        }
      }


      generatedHTML += htmlSegment;
      currentPos += opChars;
    }
    context.lineContent = generatedHTML;
  } else {
     // Line has no attributes, just escape the text
     context.lineContent = Security.escapeHTML(context.text);
  }

};

exports.stylesForExport = (hook, padId, cb) => {
  cb('img { max-width: 100%; vertical-align: middle; }');
};
