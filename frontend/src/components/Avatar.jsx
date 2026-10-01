/** Round avatar for a participant (image from the avatar folder), or initials when none is chosen. */
export default function Avatar({ file, name, size = 28 }) {
  const style = { width: size, height: size };
  if (!file) {
    return <span className="avatar avatar-initials" style={{ ...style, fontSize: size * 0.42 }} aria-hidden="true">{(name || "?").trim().slice(0, 1).toUpperCase()}</span>;
  }
  return <img className="avatar" style={style} src={`/avatar/${encodeURIComponent(file)}`} alt={name ? `${name} avatar` : "Avatar"} loading="lazy" decoding="async" />;
}
