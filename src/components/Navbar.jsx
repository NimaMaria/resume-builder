export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbarLeft">
        <span className="navbarBrand">RoleNavigator</span>
      </div>

      <div className="navbarRight">
        <button className="navbarLink" type="button">
          Home
        </button>
        <button className="navbarLogout" type="button">
          Log out
        </button>
      </div>
    </nav>
  );
}