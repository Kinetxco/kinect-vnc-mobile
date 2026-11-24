# Kinect VNC

Mobile viewer for Kinect VNC. It connects to a Kinect computer by Device ID, or to a VNC address on the local network, and shows the picture with touch, a keyboard, and the clipboard.

Direct sockets are not part of Expo Go. Build a development app before connecting:

```bash
npm install
npx expo run:android
```

On a Mac, `npx expo run:ios` builds the iPhone app. `npm start` opens the Metro server for a development build that is already installed.

Sign in on Settings with the same Kinect account used by the desktop viewer. Computers on that account appear on the Computers tab. A guest connection is a Device ID followed by the guest code.

A local address such as `192.168.1.20` or `office:5901` uses the VNC password when that computer asks for one. An address that requires VeNCrypt or Kinect RA2 on the local port should be opened by Device ID instead. The Device ID path is already encrypted.

Kinect chat is off until Settings turns it on. That announcement is the same one the desktop viewer uses for its video path, so leave it off when you want the JPEG picture.
