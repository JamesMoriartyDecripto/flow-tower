// Reads ?name= from the page URL and sets the heading as plain text.
// URLSearchParams decodes percent-escapes; textContent (not innerHTML) keeps
// the value from being interpreted as markup.
(function () {
  var params = new URLSearchParams(window.location.search);
  var name = params.get("name");

  // get() returns null when the parameter is absent and "" for ?name=.
  // Both mean no name was given, so both fall back to the stranger greeting
  // already in the HTML instead of rendering "Hello, !".
  if (!name) {
    return;
  }

  document.getElementById("greeting").textContent = "Hello, " + name + "!";
})();
