'use strict';

exports.aceAttribsToClasses = function(name, context) {
  if (context.key === 'image' && context.value) {
    return ['image:' + context.value];
  }
  if (context.key === 'image-width' && context.value) {
    return ['image-width:' + context.value];
  }
  if (context.key === 'image-height' && context.value) {
    return ['image-height:' + context.value];
  }
  // ADDED for imageCssAspectRatio
  if (context.key === 'imageCssAspectRatio' && context.value) {
    return ['imageCssAspectRatio:' + context.value];
  }
  return [];
};

exports.aceInitialized = (hook, context) => {
  // Bind the new image insertion function
  context.editorInfo.ace_doInsertImage = doInsertImage.bind(context);
};

// Function to render placeholders into actual images (Currently unused due to CSS background approach)
/*
const renderImagePlaceholders = (rootElement) => {
  const placeholders = $(rootElement).find('span.image-placeholder');
  placeholders.each(function() {
    const $placeholder = $(this);
    if ($placeholder.data('processed-image')) {
        return;
    }
    const attribsData = $placeholder.data('image-attribs');
    if (typeof attribsData === 'string') {
      try {
        const imageData = JSON.parse(attribsData);
        if (imageData && imageData.src) {
          const $img = $('<img>').attr('src', imageData.src);
          $img.css({
            'display': 'inline-block',
            'max-width': '100%',
            'max-height': '20em',
            'vertical-align': 'middle'
          });
          if (imageData.width) $img.attr('width', imageData.width);
          if (imageData.height) $img.attr('height', imageData.height);
          $placeholder.empty().append($img);
          $placeholder.data('processed-image', true);
        } else {
          $placeholder.text('[Invalid Image]');
          $placeholder.data('processed-image', true);
        }
      } catch (e) {
        console.error('[ep_image_insert] Failed to parse image data:', attribsData, e);
        $placeholder.text('[Parse Error]');
        $placeholder.data('processed-image', true);
      }
    } else {
      $placeholder.text('[Missing Data]');
      $placeholder.data('processed-image', true);
    }
  });
};
*/

exports.postAceInit = function (hook, context) {
  const padOuter = $('iframe[name="ace_outer"]').contents().find('body');
  if (padOuter.length === 0) {
      console.error('[ep_image_insert postAceInit] Could not find outer pad body.');
      return;
  }

  if ($('#imageResizeOutline').length === 0) {
      const $outlineBox = $('<div id="imageResizeOutline"></div>');
      $outlineBox.css({
          position: 'absolute',
          border: '1px dashed #1a73e8',
          backgroundColor: 'rgba(26, 115, 232, 0.1)',
          'pointer-events': 'none',
          display: 'none',
          'z-index': 1000,
          'box-sizing': 'border-box'
      });
      padOuter.append($outlineBox);
  }

  const $outlineBoxRef = padOuter.find('#imageResizeOutline');
  const _aceContext = context.ace;

  if (!$outlineBoxRef || $outlineBoxRef.length === 0) {
     console.error('[ep_image_insert postAceInit] FATAL: Could not find #imageResizeOutline OUTSIDE callWithAce.');
     return; 
  }

  context.ace.callWithAce((ace) => {
    const $innerIframe = $('iframe[name="ace_outer"]').contents().find('iframe[name="ace_inner"]');
    if ($innerIframe.length === 0) {
        console.error('ep_image_insert: ERROR - Could not find inner iframe (ace_inner).');
        return;
    }
    const innerDocBody = $innerIframe.contents().find('body')[0];
    const $inner = $(innerDocBody);
    const innerDoc = $innerIframe.contents();

    if (!$inner || $inner.length === 0) {
        console.error('ep_image_insert: ERROR - Could not get body from inner iframe.');
        return;
    }

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    let startHeight = 0;
    // let aspectRatio = 1; // Not directly used for height calculation anymore
    let currentVisualAspectRatioHW = 1;
    let targetOuterSpan = null;
    let targetInnerSpan = null;
    let targetLineNumber = -1;
    let outlineBoxPositioned = false;
    let mousedownClientX = 0;
    let mousedownClientY = 0;
    let clickedHandle = null;

    $inner.on('mousedown', '.inline-image.image-placeholder', function(evt) {
        if (evt.button !== 0) return;
        targetOuterSpan = this;
        const $targetOuterSpan = $(targetOuterSpan);

        $inner.find('.inline-image.image-placeholder.selected').removeClass('selected');
        $targetOuterSpan.addClass('selected');

        targetInnerSpan = targetOuterSpan.querySelector('span.image-inner');
        if (!targetInnerSpan) {
            console.error('[ep_image_insert mousedown] Could not find inner span.');
            targetOuterSpan = null;
            $targetOuterSpan.removeClass('selected');
            return;
        }

        const target = $(evt.target);
        const isResizeHandle = target.hasClass('image-resize-handle');

        if (isResizeHandle) {
            isDragging = true;
            outlineBoxPositioned = false;
            startX = evt.clientX;
            mousedownClientX = evt.clientX;
            mousedownClientY = evt.clientY;
            startWidth = targetInnerSpan.offsetWidth || parseInt(targetInnerSpan.style.width, 10) || 0;
            startHeight = targetInnerSpan.offsetHeight || parseInt(targetInnerSpan.style.height, 10) || 0;
            currentVisualAspectRatioHW = (startWidth > 0 && startHeight > 0) ? (startHeight / startWidth) : 1;

            if (target.hasClass('tl')) clickedHandle = 'tl';
            else if (target.hasClass('tr')) clickedHandle = 'tr';
            else if (target.hasClass('bl')) clickedHandle = 'bl';
            else if (target.hasClass('br')) clickedHandle = 'br';
            else clickedHandle = null;

            const lineElement = $(targetOuterSpan).closest('.ace-line')[0];

            if (lineElement) {
                const allImagePlaceholdersInLine = Array.from(lineElement.querySelectorAll('.inline-image.image-placeholder'));
                const imageIndex = allImagePlaceholdersInLine.indexOf(targetOuterSpan);

                if (imageIndex === -1) {
                    console.error('[ep_image_insert mousedown] Clicked image placeholder not found within its line DOM elements.');
                    isDragging = false;
                    $targetOuterSpan.removeClass('selected');
                    targetOuterSpan = null;
                    return;
                }

                targetLineNumber = _getLineNumberOfElement(lineElement);
                $(targetOuterSpan).attr('data-line', targetLineNumber);

                _aceContext.callWithAce((ace) => {
                    const rep = ace.ace_getRep();
                    if (!rep.lines.atIndex(targetLineNumber)) {
                        console.error(`[ep_image_insert mousedown] Line ${targetLineNumber} does not exist in rep.`);
                        $(targetOuterSpan).removeAttr('data-col');
                        return;
                    }
                    const lineText = rep.lines.atIndex(targetLineNumber).text;
                    const placeholderSequence = '\u200B\u200B\u200B';
                    const placeholderSequenceLength = placeholderSequence.length;
                    let colStart = -1;
                    let searchFromIndex = 0;

                    for (let k = 0; k <= imageIndex; k++) {
                        const foundIndex = lineText.indexOf(placeholderSequence, searchFromIndex);
                        if (foundIndex === -1) {
                            colStart = -1;
                            break;
                        }
                        if (k === imageIndex) {
                            colStart = foundIndex;
                            break;
                        }
                        searchFromIndex = foundIndex + placeholderSequenceLength;
                    }

                    if (colStart >= 0) {
                        $(targetOuterSpan).attr('data-col', colStart);
                    } else {
                        console.error(`[ep_image_insert mousedown] Could not find the ${imageIndex}-th placeholder sequence in line text for line ${targetLineNumber}: "${lineText}"`);
                        $(targetOuterSpan).removeAttr('data-col');
                    }
                }, 'getImageColStart', true);
            } else {
                console.error('[ep_image_insert mousedown] Could not find parent .ace-line for the clicked image.');
                isDragging = false;
                $targetOuterSpan.removeClass('selected');
                targetOuterSpan = null;
                return;
            }
            evt.preventDefault();
        }
    });

    innerDoc.on('mousemove', function(evt) {
        if (isDragging) {
            if (!outlineBoxPositioned) {
                 if (!targetInnerSpan || !padOuter || !targetOuterSpan || !innerDocBody || !$innerIframe) {
                     console.error('[ep_image_insert mousemove] Cannot position outline: Required elements missing.');
                     return;
                 }
                 const currentWidth = startWidth;
                 const currentHeight = startHeight;

                 // if (currentWidth <= 0 || currentHeight <= 0) { /* Warning for this was removed */ }

                 let innerBodyRect, innerIframeRect, outerBodyRect;
                 let scrollTopInner, scrollLeftInner, scrollTopOuter, scrollLeftOuter;
                 try {
                     innerBodyRect = innerDocBody.getBoundingClientRect();
                     innerIframeRect = $innerIframe[0].getBoundingClientRect();
                     outerBodyRect = padOuter[0].getBoundingClientRect();
                     scrollTopInner = innerDocBody.scrollTop;
                     scrollLeftInner = innerDocBody.scrollLeft;
                     scrollTopOuter = padOuter.scrollTop();
                     scrollLeftOuter = padOuter.scrollLeft();
                 } catch (e) {
                     console.error('[ep_image_insert mousemove] Error getting container rects/scrolls:', e);
                     return; 
                 }

                 const clickTopRelInner = mousedownClientY - innerBodyRect.top + scrollTopInner;
                 const clickLeftRelInner = mousedownClientX - innerBodyRect.left + scrollLeftInner;
                 const innerFrameTopRelOuter = innerIframeRect.top - outerBodyRect.top + scrollTopOuter;
                 const innerFrameLeftRelOuter = innerIframeRect.left - outerBodyRect.left + scrollLeftOuter;
                 const baseClickTopOuter = innerFrameTopRelOuter + clickTopRelInner;
                 const baseClickLeftOuter = innerFrameLeftRelOuter + clickLeftRelInner;
                 let outlineTop = baseClickTopOuter;
                 let outlineLeft = baseClickLeftOuter;

                 if (clickedHandle === 'tr' || clickedHandle === 'br') {
                    outlineLeft -= currentWidth;
                 }
                 if (clickedHandle === 'bl' || clickedHandle === 'br') {
                    outlineTop -= currentHeight;
                 }

                 const outerPadding = window.getComputedStyle(padOuter[0]);
                 const outerPaddingTop = parseFloat(outerPadding.paddingTop) || 0;
                 const outerPaddingLeft = parseFloat(outerPadding.paddingLeft) || 0; 
                 const finalOutlineTop = outlineTop + outerPaddingTop; 
                 const finalOutlineLeft = outlineLeft + outerPaddingLeft; 
                 const MANUAL_OFFSET_TOP = 9;
                 const MANUAL_OFFSET_LEFT = 42;
                 const finalTopWithManualOffset = finalOutlineTop + MANUAL_OFFSET_TOP; 
                 const finalLeftWithManualOffset = finalOutlineLeft + MANUAL_OFFSET_LEFT;

                 $outlineBoxRef.css({
                     left: finalLeftWithManualOffset + 'px', 
                     top: finalTopWithManualOffset + 'px',   
                     width: currentWidth + 'px',
                     height: currentHeight + 'px',
                     display: 'block'
                 });
                 outlineBoxPositioned = true;
            }

            if ($outlineBoxRef && $outlineBoxRef.length > 0) {
                const currentX = evt.clientX;
                const deltaX = currentX - startX;
                let newPixelWidth = startWidth + deltaX;

                if (targetOuterSpan) {
                    const $tableCell = $(targetOuterSpan).closest('td, th');
                    if ($tableCell.length > 0) {
                        const parentWidth = $tableCell.width();
                        if (parentWidth > 0) {
                           newPixelWidth = Math.min(newPixelWidth, parentWidth);
                        }
                    }
                }
                newPixelWidth = Math.max(20, newPixelWidth);
                const newPixelHeight = newPixelWidth * currentVisualAspectRatioHW;
                $outlineBoxRef.css({
                    width: newPixelWidth + 'px',
                    height: newPixelHeight + 'px'
                });
            } else {
                console.error('[ep_image_insert mousemove] Outline box ref missing or invalid during size update!');
            }
            $inner.css('cursor', 'nwse-resize');
        }
    });

    innerDoc.on('mouseup', function(evt) {
        if (isDragging) {
            const finalX = evt.clientX;
            const deltaX = finalX - startX;
            let finalPixelWidth = startWidth + deltaX;

            if (targetOuterSpan) {
                const $tableCell = $(targetOuterSpan).closest('td, th');
                if ($tableCell.length > 0) {
                    const parentWidth = $tableCell.width();
                     if (parentWidth > 0) {
                        finalPixelWidth = Math.min(finalPixelWidth, parentWidth);
                    }
                }
            }

            finalPixelWidth = Math.max(20, Math.round(finalPixelWidth));
            const widthToApply = `${finalPixelWidth}px`;
            const finalPixelHeight = Math.round(finalPixelWidth * currentVisualAspectRatioHW);
            const heightToApplyPx = `${finalPixelHeight}px`;
            const newCssAspectRatioForVar = (startWidth > 0 && startHeight > 0) ? (startWidth / startHeight).toFixed(4) : '1';

            if (targetInnerSpan) {
                $(targetInnerSpan).css({
                    'width': widthToApply,
                });
                targetInnerSpan.style.removeProperty('height');
                targetInnerSpan.style.setProperty('--image-css-aspect-ratio', newCssAspectRatioForVar);
            } else {
                console.error('[ep_image_insert mouseup] targetInnerSpan missing, cannot apply style!');
            }

            let targetRange = null;
            if (targetOuterSpan) {
                const lineStr = $(targetOuterSpan).attr('data-line');
                const colStr = $(targetOuterSpan).attr('data-col');
                if (lineStr !== undefined && colStr !== undefined) {
                    const lineNum = parseInt(lineStr, 10);
                    const colStart = parseInt(colStr, 10);
                    if (!isNaN(lineNum) && !isNaN(colStart)) {
                         const rangeStart = [lineNum, colStart + 1];
                         const rangeEnd = [lineNum, colStart + 2];
                         targetRange = [rangeStart, rangeEnd];
                    } else {
                         console.error('[ep_image_insert mouseup] Invalid line/col data attributes:', lineStr, colStr);
                    }
                } else {
                     console.error('[ep_image_insert mouseup] Missing line/col data attributes.');
                }
            }

            if (targetRange) {
                 _aceContext.callWithAce((ace) => {
                     ace.ace_performDocumentApplyAttributesToRange(targetRange[0], targetRange[1], [
                         ['image-width', widthToApply],
                         ['image-height', heightToApplyPx],
                         ['imageCssAspectRatio', newCssAspectRatioForVar]
                     ]);
                 }, 'applyImageAttributes', true);
            } else {
                 console.error('[ep_image_insert mouseup] Cannot apply attribute: Target range not found.');
            }

            isDragging = false;
            outlineBoxPositioned = false;
            clickedHandle = null;
            $outlineBoxRef.hide();
            $inner.css('cursor', 'auto');
            if (targetOuterSpan) $(targetOuterSpan).removeClass('selected');
            targetOuterSpan = null;
            targetInnerSpan = null;
            targetLineNumber = -1;
            if (targetOuterSpan) {
                $(targetOuterSpan).removeAttr('data-line').removeAttr('data-col');
            }
        }
    });

    $inner.on('paste', function(evt) {
        const clipboardData = evt.originalEvent.clipboardData || window.clipboardData;
        if (!clipboardData) return;
        let foundImage = false;
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                foundImage = true; 
                let isValid = true;
                const errorTitle = html10n.get('ep_image_insert.error.title');
                if (clientVars.ep_image_insert && clientVars.ep_image_insert.fileTypes) {
                    const mimedb = clientVars.ep_image_insert.mimeTypes;
                    const mimeTypeInfo = mimedb[file.type];
                    let validMime = false;
                    if (mimeTypeInfo && mimeTypeInfo.extensions) {
                       for (const fileType of clientVars.ep_image_insert.fileTypes) {
                           if (mimeTypeInfo.extensions.includes(fileType)) {
                               validMime = true;
                               break;
                           }
                       }
                    }
                    if (!validMime) {
                       const errorMessage = html10n.get('ep_image_insert.error.fileType');
                       $.gritter.add({ title: errorTitle, text: errorMessage, sticky: true, class_name: 'error' });
                       isValid = false;
                    }
                }
                if (isValid && clientVars.ep_image_insert && file.size > clientVars.ep_image_insert.maxFileSize) {
                   const allowedSize = (clientVars.ep_image_insert.maxFileSize / 1000000);
                   const errorText = html10n.get('ep_image_insert.error.fileSize', { maxallowed: allowedSize });
                   $.gritter.add({ title: errorTitle, text: errorText, sticky: true, class_name: 'error' });
                   isValid = false;
                }
                if (isValid) {
                    evt.preventDefault();
                    const reader = new FileReader();
                    reader.onload = (e_reader) => {
                        const data = e_reader.target.result;
                        const img = new Image();
                        img.onload = () => {
                            const widthPx = `${img.naturalWidth}px`;
                            const heightPx = `${img.naturalHeight}px`;
                            _aceContext.callWithAce((ace) => {
                                ace.ace_doInsertImage(data, widthPx, heightPx);
                            }, 'pasteImage', true);
                        };
                        img.onerror = () => {
                            console.error('[ep_image_insert paste] Failed to load pasted image data. Inserting without dimensions.');
                            _aceContext.callWithAce((ace) => {
                                ace.ace_doInsertImage(data);
                            }, 'pasteImageError', true);
                        };
                        img.src = data;
                    };
                    reader.onerror = (e_reader) => {
                         console.error('[ep_image_insert paste] FileReader error:', e_reader);
                         $.gritter.add({ title: errorTitle, text: 'Error reading pasted image file.', sticky: true, class_name: 'error' });
                    };
                    reader.readAsDataURL(file);
                }
                break; 
            }
        }
        // if (foundImage) { /* handled by preventDefault */ } 
        // else { /* Allow default paste for non-image content */ }
    });

    $(innerDoc).on('mousedown', function(evt) {
        if (!$(evt.target).closest('.inline-image.image-placeholder').length) {
             $inner.find('.inline-image.image-placeholder.selected').removeClass('selected');
        }
    });
  }, 'image_resize_listeners', true);
};

function _getLineNumberOfElement(element) {
  let currentElement = element;
  let count = 0;
  while (currentElement = currentElement.previousElementSibling) {
    count++;
  }
  return count;
}

exports.aceEditorCSS = (hookName, context) => {
  return [
    'ep_image_insert/static/css/ace.css'
  ];
};

exports.aceRegisterBlockElements = () => ['img'];

exports.aceCreateDomLine = (hookName, args, cb) => {
  if (args.cls && args.cls.indexOf('image:') >= 0) {
    const clss = [];
    // let escapedSrc; // Not used directly here, but extracted by acePostWriteDomLineHTML
    const argClss = args.cls.split(' ');
    for (let i = 0; i < argClss.length; i++) {
      const cls = argClss[i];
      // Keep all classes, including image:* which acePostWriteDomLineHTML needs
      clss.push(cls);
    }
    clss.push('inline-image', 'character', 'image-placeholder');
    const handleHtml = 
      '<span class="image-resize-handle tl"></span>' +
      '<span class="image-resize-handle tr"></span>' +
      '<span class="image-resize-handle bl"></span>' +
      '<span class="image-resize-handle br"></span>';
    const modifier = {
      extraOpenTags: `<span class="image-inner"></span>${handleHtml}`,
      extraCloseTags: '',
      cls: clss.join(' '),
    };
    return cb([modifier]);
  } else {
    return cb();
  }
};

const Changeset = require('ep_etherpad-lite/static/js/Changeset');
exports.acePostWriteDomLineHTML = (hookName, context) => {
  const lineNode = context.node; 
  if (!lineNode) return;

  const placeholders = lineNode.querySelectorAll('span.image-placeholder');
  placeholders.forEach((placeholder, index) => { 
    const outerSpan = placeholder;
    const innerSpan = outerSpan.querySelector('span.image-inner');
    if (!innerSpan) return;

    let escapedSrc = null;
    let imageWidth = null;
    let imageCssAspectRatioVal = null;
    const classes = outerSpan.className.split(' '); 
    for (const cls of classes) {
      if (cls.startsWith('image:')) {
        escapedSrc = cls.substring(6);
      } else if (cls.startsWith('image-width:')) {
        const widthValue = cls.substring(12);
        if (/\d+px$/.test(widthValue)) {
          imageWidth = widthValue;
        }
      } else if (cls.startsWith('imageCssAspectRatio:')) {
        imageCssAspectRatioVal = cls.substring(20);
      }
    }

    if (imageWidth) {
      innerSpan.style.width = imageWidth;
    } // else { /* Optional: Apply a default width? */ }

    if (imageCssAspectRatioVal) {
      innerSpan.style.setProperty('--image-css-aspect-ratio', imageCssAspectRatioVal);
    } else {
      innerSpan.style.setProperty('--image-css-aspect-ratio', '1');
    }
    innerSpan.style.removeProperty('height');

    if (escapedSrc) {
      try {
        const src = decodeURIComponent(escapedSrc);
        if (src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/'))) {
          innerSpan.style.setProperty('--image-src', `url("${src}")`);
        } // else { /* Invalid unescaped src warning removed */ }
      } catch (e) {
        console.error(`[ep_image_insert acePostWriteDomLineHTML] Error setting CSS var for placeholder #${index}:`, e);
      }
    } // else { /* Placeholder found, but no image:* class warning removed */ }
  });
};

exports.aceAttribClasses = (hook, attr) => {
  return []; 
};

exports.collectContentPost = function(name, context) {
  const node = context.node;
  const state = context.state;
  const tname = context.tname;

  if (tname === 'span' && node && node.classList && node.classList.contains('image-inner')) {
    const innerNode = node;
    // let widthPx = null; // Not needed to initialize here
    // let heightPx = null; // Not needed to initialize here

    if (innerNode.style && innerNode.style.width) {
       const widthMatch = innerNode.style.width.match(/^(\d+)(?:px)?$/);
       if (widthMatch && widthMatch[1]) {
           const widthVal = parseInt(widthMatch[1], 10);
           if (!isNaN(widthVal) && widthVal > 0) {
              let widthToAttrib = `${widthVal}px`;
              if (innerNode.offsetWidth && innerNode.offsetWidth !== widthVal) {
                  widthToAttrib = `${innerNode.offsetWidth}px`;
              }
              state.attribs = state.attribs || {};
              state.attribs['image-width'] = widthToAttrib;
           } // else { /* Parsed width not positive warning removed */ }
       } // else { /* Could not parse width warning removed */ }
    } // else { /* style.width missing warning removed; decision not to delete attribute if style missing */ }

    if (innerNode.style && innerNode.style.height) {
       const heightMatch = innerNode.style.height.match(/^(\d+)(?:px)?$/); 
       if (heightMatch && heightMatch[1]) {
           const heightVal = parseInt(heightMatch[1], 10);
           if (!isNaN(heightVal) && heightVal > 0) {
              state.attribs = state.attribs || {};
              state.attribs['image-height'] = `${heightVal}px`;
           } // else { /* Parsed height not positive warning removed */ }
       } // else { /* Could not parse height warning removed */ }
    } // else { /* style.height missing warning removed */ }

    const computedStyle = window.getComputedStyle(innerNode);
    const cssAspectRatioFromVar = computedStyle.getPropertyValue('--image-css-aspect-ratio');
    if (cssAspectRatioFromVar && cssAspectRatioFromVar.trim() !== '') {
        state.attribs = state.attribs || {};
        state.attribs['imageCssAspectRatio'] = cssAspectRatioFromVar.trim();
    } else {
        if (innerNode.offsetWidth > 0 && innerNode.offsetHeight > 0) {
            const calculatedCssAspectRatio = (innerNode.offsetWidth / innerNode.offsetHeight).toFixed(4);
            state.attribs = state.attribs || {};
            state.attribs['imageCssAspectRatio'] = calculatedCssAspectRatio;
        }
    }
  }
};

exports.aceKeyEvent = (hookName, context, cb) => {
  // const { evt, editorInfo } = context; // Unused
  // const rep = editorInfo.ace_getRep(); // Unused
  // const lineNumber = rep.selStart[0]; // Unused
  // const currentColumn = rep.selStart[1]; // Unused
  // const key = evt.key; // Unused
  return cb(false);
};

const doInsertImage = function (src, widthPx, heightPx) {
  const ZWSP = '\u200B';
  const PLACEHOLDER = '\u200B';
  const editorInfo = this.editorInfo;
  const rep = editorInfo.ace_getRep();
  const docMan = this.documentAttributeManager;

  if (!editorInfo || !rep || !rep.selStart || !docMan || !src) {
    console.error('[ep_image_insert doInsertImage] Missing context or src');
    return;
  }

  const cursorPos = rep.selStart;
  editorInfo.ace_replaceRange(cursorPos, cursorPos, ZWSP + PLACEHOLDER + ZWSP);

  const imageAttrStart = [cursorPos[0], cursorPos[1] + ZWSP.length];
  const imageAttrEnd = [cursorPos[0], cursorPos[1] + ZWSP.length + PLACEHOLDER.length];
  const escapedSrc = encodeURIComponent(src);
  const attributesToSet = [['image', escapedSrc]];

  if (widthPx && /^\d+px$/.test(widthPx)) {
      attributesToSet.push(['image-width', widthPx]);
  }
  if (heightPx && /^\d+px$/.test(heightPx)) {
      attributesToSet.push(['image-height', heightPx]);
  }
  if (widthPx && heightPx) {
    const naturalWidthNum = parseInt(widthPx, 10);
    const naturalHeightNum = parseInt(heightPx, 10);
    if (naturalWidthNum > 0 && naturalHeightNum > 0) {
        const cssAspectRatio = (naturalWidthNum / naturalHeightNum).toFixed(4);
        attributesToSet.push(['imageCssAspectRatio', cssAspectRatio]);
    }
  }
  docMan.setAttributesOnRange(imageAttrStart, imageAttrEnd, attributesToSet);
};
