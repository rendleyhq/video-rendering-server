function getRenderCompletedView({ filePath, duration }) {
  return `
   <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body>
        <p>Rendering took ${duration} seconds</p>
        <video src="${filePath}" controls style="max-width: 500px">
    </body>
    </html>
  `;
}

module.exports = getRenderCompletedView;
