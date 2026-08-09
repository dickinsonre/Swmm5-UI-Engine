{pkgs}: {
  deps = [
    pkgs.cmake
    pkgs.emscripten
    pkgs.chromium
    pkgs.musl
    pkgs.p7zip
  ];
}
