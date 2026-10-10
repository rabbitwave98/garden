document.addEventListener("DOMContentLoaded", function () {
  if (!document.body.classList.contains("no-layout")) {
    document.body.insertAdjacentHTML("afterbegin", banner);
    document.body.insertAdjacentHTML("afterbegin", header);
    document.body.insertAdjacentHTML("beforeend", footer);

    const main = document.querySelector("main");

    if (main) {
      const contentRow = document.createElement("div");
      contentRow.className = "content-row";

      main.parentNode.insertBefore(contentRow);
      
      contentRow.appendChild(main);
    }

    

    initActiveLinks();
  }

  // add your own javascript code here...
});

function initActiveLinks() {
  const pathname = window.location.pathname;
  [...document.querySelectorAll("a")].forEach((el) => {
    const elHref = el
      .getAttribute("href")
      .replace(".html", "")
      .replace("/public", "");

    if (pathname == "/") {
      if (elHref == "/" || elHref == "/index.html") el.classList.add("active");
    } else {
      if (window.location.href.includes(elHref)) el.classList.add("active");
    }
  });
}

function getNestingString() {
  const currentUrl = window.location.href
    .replace("http://", "")
    .replace("https://", "")
    .replace("/public/", "/");
  const numberOfSlahes = currentUrl.split("/").length - 1;
  if (numberOfSlahes == 1) return ".";
  if (numberOfSlahes == 2) return "..";
  return ".." + "/..".repeat(numberOfSlahes - 2);
}

const nesting = getNestingString();

/**
  Use ${nesting} to output a . or .. or ../.. etc according to the current page's folder depth.
  Example: <img src="${nesting}/images/example.jpg" />
 */

const banner = `
<div class="banner"> </div>
<div class="crt-allthethings"> </div>
  

`;

const header = `
<div class="yumemiru">
<div class="chungus"><img src="https://raw.githubusercontent.com/rabbitwave98/garden/refs/heads/main/img/wave01.png"> <img src="https://raw.githubusercontent.com/rabbitwave98/garden/refs/heads/main/img/wave02.png"> <img src="https://raw.githubusercontent.com/rabbitwave98/garden/refs/heads/main/img/wave03.png"> <img src="https://raw.githubusercontent.com/rabbitwave98/garden/refs/heads/main/img/wave04.png"></div>

<div class="disco"><div class="crt-filter"></div></div>
    
      <div class="thisisadigitalgarden"><div class="rabbitwave98">rabbitwave98</div><br><div class="thisisa">[ this is a digital garden. ]</div></div>
<div class="friendly"><h1>.app to be a friendly .exe<br><div style="text-align: right;">[ these are aesthetics maybe ]</h1></div></div>
</div>

<div class="flexwrapper">
	<header>
		<nav>
			<a href="/">index</a>
			<a href="about.html">about</a>
			<a href="blog.html">blog</a>
			<a href="garden.html">garden</a>
            <a href="credits.html">credits</a>
            <a href="links.html">links</a>
            
		</nav>
	</header>
 
`;

const footer = `

	<footer>
		<span><h1>🎀 (っ◔◡◔)っ ♥ 【﻿𝙲𝟿𝙷𝟷𝟹𝙽】♥  🎀</h1><br> this digital garden is by rabbitwave98. <a href="credits.html">credits page.</a>
</span>
	</footer>
  
</div>
<div class="bottomspacer"></div>
`;







