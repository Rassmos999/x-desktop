Name:           x-desktop
Version:        %{version}
Release:        1%{?dist}
Summary:        Standalone X/Twitter Desktop Client with Wayland and Niri integration
License:        MIT
URL:            https://github.com/x-desktop/x-desktop
Source0:        %{name}-%{version}.tar.gz

BuildArch:      x86_64
AutoReqProv:    no

Requires:       alsa-lib
Requires:       at-spi2-core
Requires:       cairo
Requires:       cups-libs
Requires:       dbus-libs
Requires:       glib2
Requires:       gtk3
Requires:       libdrm
Requires:       libX11
Requires:       libXcomposite
Requires:       libXdamage
Requires:       libXext
Requires:       libXfixes
Requires:       libXrandr
Requires:       mesa-libgbm
Requires:       nspr
Requires:       nss
Requires:       pango
Requires:       zlib

%description
Standalone X/Twitter Desktop Client with Wayland & Niri integration, Video PiP, and MPRIS controls.

%prep
%setup -q

%build

%install
rm -rf %{buildroot}
make install DESTDIR=%{buildroot} PREFIX=/usr
install -Dm644 README.md %{buildroot}/usr/share/doc/%{name}/README.md
install -Dm644 data/niri-rules.kdl %{buildroot}/usr/share/doc/%{name}/niri-rules.kdl
install -Dm644 data/hyprland-rules.conf %{buildroot}/usr/share/doc/%{name}/hyprland-rules.conf

%files
/usr/bin/%{name}
/usr/lib/%{name}
/usr/share/applications/%{name}.desktop
/usr/share/icons/hicolor/*/apps/%{name}.png
/usr/share/doc/%{name}/README.md
/usr/share/doc/%{name}/niri-rules.kdl
/usr/share/doc/%{name}/hyprland-rules.conf

