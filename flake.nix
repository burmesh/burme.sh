{
  description = "burme.sh — Burlington Mesh static site, served from a Cloudflare Worker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          # Wrangler is intentionally NOT pulled from nixpkgs: it has no prebuilt
          # binary for aarch64-darwin, so `nix develop` would compile it from
          # source on every entry (slow and fragile). Instead the flake provides
          # Node.js and Wrangler is installed from npm (ships prebuilt binaries).
          default = pkgs.mkShell {
            packages = with pkgs; [
              cacert
              git
              go-task
              nodejs_24
            ];

            env = {
              # Ensure SSL certificates are found on all platforms (NixOS, non-NixOS, CI)
              SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
              NODE_EXTRA_CA_CERTS = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
              # Keep Wrangler quiet and telemetry-free
              WRANGLER_SEND_METRICS = "false";
            };

            shellHook = ''
              BOLD="\033[1m"
              DIM="\033[2m"
              CYAN="\033[36m"
              GREEN="\033[32m"
              YELLOW="\033[33m"
              WHITE="\033[37m"
              RESET="\033[0m"

              printf "\n"
              printf "''${CYAN}  __  __           _    ___                ''${RESET}\n"
              printf "''${CYAN} |  \/  | ___  ___| |__ / __|___ _ _ ___   ''${RESET}\n"
              printf "''${CYAN} | |\/| |/ -_)(_-<| '_ \ (__/ _ \ '_/ -_)  ''${RESET}\n"
              printf "''${CYAN} |_|  |_|\___|/__/|_.__/\___\___/_| \___|  ''${RESET}\n"
              printf "''${DIM}''${WHITE}  ───────── Burlington Mesh · burme.sh ─────────''${RESET}\n"
              printf "\n"
              printf "  ''${GREEN}Node.js''${RESET}  $(node --version)\n"
              printf "  ''${GREEN}npm''${RESET}      $(npm --version)\n"
              printf "\n"

              # Install Wrangler (and any other devDependencies) from npm on first entry
              if [ ! -d "node_modules" ]; then
                printf "  ''${YELLOW}node_modules not found — running npm install...''${RESET}\n\n"
                npm install
              fi

              printf "  ''${DIM}Preview:''${RESET} ''${BOLD}task run''${RESET}    ''${DIM}(npx wrangler dev)''${RESET}\n"
              printf "  ''${DIM}Deploy: ''${RESET} ''${BOLD}task deploy''${RESET} ''${DIM}(npx wrangler deploy)''${RESET}\n"
              printf "\n"
            '';
          };
        }
      );
    };
}
