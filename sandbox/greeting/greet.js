// Reads ?name= from the page URL and sets the heading as plain text.
// URLSearchParams decodes percent-escapes; textContent (not innerHTML) keeps
// the value from being interpreted as markup.
(function () {
  var params = new URLSearchParams(window.location.search);
  var name = params.get("name");

  // get() returns null only when the parameter is absent; ?name= yields "".
  // An absent name falls back to the stranger greeting already in the HTML.
  if (name === null) {
    return;
  }

  document.getElementById("greeting").textContent = "Hello, " + name + "!";
})();
