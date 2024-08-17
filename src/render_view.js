function getRenderView({ data, license }) {
  return `
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <canvas id="renderer"></canvas>

    <script async type="module">
      import { Engine } from "/packages/rendley-sdk";

      const renderer = document.getElementById("renderer");

      if (!renderer) {
        throw new Error("Renderer not found");
      }

      const engine = Engine.getInstance();

      await engine.init({
        license: {
          licenseName: "${license.licenseName}",
          licenseKey: "${license.licenseKey}",
        },
        display: {
          view: renderer,
        },
      });

      try {
        await Engine.deserialize(${JSON.stringify(data)});
      
        const blob = await engine.export();
        const buffer = await blob.arrayBuffer();
        const data = [...(new Uint8Array(buffer))];
    
        window.onRenderCompleted && window.onRenderCompleted(data);
      } catch (error) {
        window.onRenderError && window.onRenderError(error.message);
      }
     
    </script>
  </body>
</html>
`;
}

module.exports = { getRenderView };
