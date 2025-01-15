const config = require("../config");

function simplifyData(data, from, to, exportType, excludeClipTypes) {
	// Duplicate data
	const newData = JSON.parse(JSON.stringify(data));
	excludeClipTypes = excludeClipTypes || [];

	const mediaIdToKeep = [];
	const clipIdsToRemove = [];

	newData.timeline.layers.forEach((layer) => {
		// We need to process transitions as they add padding to the clip segment and content needs to be rendered!
		const clipRightPadding = new Map();
		const clipLeftPadding = new Map();
		layer.transitions.forEach((transition) => {
			clipLeftPadding.set(transition.endClipId, transition.inDuration);
			clipRightPadding.set(transition.startClipId, transition.outDuration);
		});

		layer.clips.forEach((clip) => {
			const leftPadding = clipLeftPadding.get(clip.id) || 0;
			const rightPadding = clipRightPadding.get(clip.id) || 0;
			const leftRenderBounds = clip.startTime + clip.leftTrim - leftPadding;

			if (clip.duration) {
				const rightRenderBounds = clip.startTime + clip.duration - clip.rightTrim + rightPadding;

				// We check the overlap here, not if it's inside! double check before trying to correct it wrongly asumming it's wrong!
				if (leftRenderBounds <= to && rightRenderBounds >= from && !excludeClipTypes.includes(clip.type)) {
					mediaIdToKeep.push(clip.mediaDataId);
				} else {
					clipIdsToRemove.push(clip.id);
				}
			} else {
				// We don't know the duration so it might go over the segment
				if (leftRenderBounds <= to && !excludeClipTypes.includes(clip.type)) {
					mediaIdToKeep.push(clip.mediaDataId);
				} else {
					clipIdsToRemove.push(clip.id);
				}
			}
		});
	});

	newData.timeline.layers.forEach((layer) => {
		layer.clips = layer.clips.filter((clip) => !clipIdsToRemove.includes(clip.id));
	});

	newData.library.media = newData.library.media.filter((mediaData) => mediaIdToKeep.includes(mediaData.id));

	return newData;
}

function getRenderView({ data, from, to, exportType, excludeClipTypes }) {
	const updatedData = simplifyData(data, from, to, exportType, excludeClipTypes);
	return `
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="shortcut icon" href="data:image/x-icon;," type="image/x-icon">
  </head>
  <body>
    <canvas id="renderer"></canvas>

    <script async type="module">
      import { Engine } from "/packages/rendley-sdk";

      const renderer = document.getElementById("renderer");


      if (!renderer) {
          throw new Error("Renderer canvas not found");
      }
     
      const engine = Engine.getInstance();

      await engine.init({
        license: {
          licenseName: "${config.license.licenseName}",
          licenseKey: "${config.license.licenseKey}",
        },
        display: {
          view: renderer,
        }
      });

      await Engine.deserialize(${JSON.stringify(updatedData)});

      engine.getSettings().setDecoderPreferredAcceleration("${config.rendering.preferredDecodingAcceleration}");
      
      engine.getSettings().setEncoderPreferredAcceleration("${config.rendering.preferredEncodingAcceleration}"); 

      window.exportVideo = async () => {
        try {
          const exportResult = await engine.export({ from: ${from}, to: ${to}, type: "${exportType}" });
      
          if (exportResult !== null)
          {
            const buffer = await exportResult.blob.arrayBuffer();
            
            const buffer_size = ${config.rendering.chunkPartialBufferSize};

            window.prepareBuffer?.(buffer.byteLength);

            for (let i = 0; i < buffer.byteLength; i += buffer_size) {
              const chunk = buffer.slice(i, i + buffer_size);
              await window.feedBuffer?.(Array.from(new Uint8Array(chunk))); 
            }

            return true;
          } else {
            return false;
          }
        } catch (err) {
          console.error("[ERROR] Failed to export video", err);
          return false;
        }
      };
    </script>
  </body>
</html>
`;
}

module.exports = getRenderView;
