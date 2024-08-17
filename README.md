# Video Rendering Server

This repository provides an example of how to use the [Rendley SDK](https://rendley.com/) to render videos on a server. Although Rendley SDK is typically used for video editing directly in the browser, this setup allows for server-side rendering for use cases that require it.

## Installation

1. **Clone the repository:**

```bash
   git clone https://github.com/rendleyhq/video-rendering-server.git
   cd video-rendering-server
```

2. **Install the dependencies:**

```bash
npm install
```

3. **Obtain a free license from [app.rendley.com](https://app.rendley.com/)**

4. **Create a `.env` file with the necessary credentials:**

```bash
PORT=3000
LICENSE_NAME=""
LICENSE_KEY=""
```

## Usage

1. **Start the server:**

```bash
npm start
```

2. **Render a video:**

Visit `http://localhost:3000/` in your browser. The server includes a few serialized state files located in `src/data/`, which are used to test the rendering capabilities. When you visit the URL, one of these JSON files will be rendered.

Optionally, you can pass your own serialized state by making a `POST` request to `http://localhost:3000/` with your custom payload.

## Storage

All rendered videos are stored on the server using the filesystem (FS). The videos are saved in the `videos/` directory.
